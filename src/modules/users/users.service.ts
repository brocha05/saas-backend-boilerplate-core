import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UpdateProfileDto,
  DeleteAccountDto,
} from './dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { User } from '@prisma/client';
import {
  NotificationEvent,
  UserInvitedEvent,
} from '../notifications/events/notification.events';

export interface PaginatedUsers {
  data: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const USER_PROFILE_TTL = 300; // 5 minutes

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  async findAll(
    companyId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedUsers> {
    const { page = 1, limit = 20, skip } = pagination;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId, deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { companyId, deletedAt: null } }),
    ]);

    return {
      data: users.map(UserResponseDto.fromEntity),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, companyId: string): Promise<UserResponseDto> {
    const user = await this.findUserOrThrow(id, companyId);
    return UserResponseDto.fromEntity(user);
  }

  async create(
    dto: CreateUserDto,
    companyId: string,
  ): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
        companyId,
        role: dto.role ?? 'MEMBER',
      },
    });

    return UserResponseDto.fromEntity(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    companyId: string,
  ): Promise<UserResponseDto> {
    await this.findUserOrThrow(id, companyId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    await this.cache.del(`user:${id}`);

    return UserResponseDto.fromEntity(updated);
  }

  async remove(
    id: string,
    companyId: string,
    requesterId: string,
  ): Promise<void> {
    if (id === requesterId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    await this.findUserOrThrow(id, companyId);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.cache.del(`user:${id}`);
  }

  // ─── Self-service profile ──────────────────────────────────────────────────

  async getMyProfile(userId: string): Promise<UserResponseDto> {
    const cacheKey = `user:${userId}`;
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) return UserResponseDto.fromEntity(cached);

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.cache.set(cacheKey, user, USER_PROFILE_TTL);
    return UserResponseDto.fromEntity(user);
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    await this.cache.del(`user:${userId}`);

    return UserResponseDto.fromEntity(updated);
  }

  async deleteMyAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Password is incorrect');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), isActive: false },
      }),
      // Revoke all sessions
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.cache.del(`user:${userId}`);

    this.logger.log(`User ${userId} deleted their own account`);
  }

  async resendInvite(
    userId: string,
    companyId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const [user, requester, company] = await Promise.all([
      this.findUserOrThrow(userId, companyId),
      this.prisma.user.findUnique({ where: { id: requesterId } }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
    ]);

    const notifEvent = new UserInvitedEvent();
    notifEvent.inviteeEmail = user.email;
    notifEvent.inviteeName = user.firstName;
    notifEvent.companyId = companyId;
    notifEvent.companyName = company?.name ?? '';
    notifEvent.inviterName = requester
      ? `${requester.firstName} ${requester.lastName}`
      : 'A team member';
    // No inviteToken — user already exists, email directs to login
    this.eventEmitter.emit(NotificationEvent.USER_INVITED, notifEvent);

    this.logger.log(`Resend invite for user: ${user.email}`);
    return { message: `Invitation resent to ${user.email}.` };
  }

  private async findUserOrThrow(id: string, companyId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }
}
