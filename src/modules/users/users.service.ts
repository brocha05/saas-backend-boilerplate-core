import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto';
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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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
