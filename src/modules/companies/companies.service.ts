import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyDto, InviteUserDto } from './dto';
import { Company, User } from '@prisma/client';
import {
  NotificationEvent,
  UserInvitedEvent,
} from '../notifications/events/notification.events';
import type { MulterFile } from '../../common/interfaces';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<Company> {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findWithSubscription(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.findById(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async getMembers(
    companyId: string,
  ): Promise<Omit<User, 'password' | 'twoFactorSecret'>[]> {
    const users = await this.prisma.user.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        emailVerified: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return users;
  }

  async inviteUser(
    companyId: string,
    dto: InviteUserDto,
    inviterId: string,
  ): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      if (existing.companyId === companyId) {
        throw new ConflictException('User is already a member of this company');
      }
      throw new ConflictException(
        'Email already registered in another company',
      );
    }

    const [inviter, company] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: inviterId } }),
      this.findById(companyId),
    ]);

    const notifEvent = new UserInvitedEvent();
    notifEvent.inviteeEmail = dto.email;
    notifEvent.companyId = companyId;
    notifEvent.companyName = company.name;
    notifEvent.inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`
      : 'A team member';
    this.eventEmitter.emit(NotificationEvent.USER_INVITED, notifEvent);

    this.logger.log(`Invitation sent to ${dto.email} for company ${companyId}`);

    return {
      message: `Invitation sent to ${dto.email}. They will receive an email to complete registration.`,
    };
  }

  async delete(companyId: string): Promise<void> {
    await this.findById(companyId);
    await this.prisma.company.update({
      where: { id: companyId },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Company ${companyId} soft-deleted`);
  }

  async uploadLogo(
    companyId: string,
    file: MulterFile,
  ): Promise<{ url: string }> {
    await this.findById(companyId);
    const url = `/uploads/logos/${file.filename}`;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { logoUrl: url },
    });
    return { url };
  }

  async changePlan(
    companyId: string,
    planId: string,
  ): Promise<{ message: string }> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    // The actual Stripe subscription update is handled in SubscriptionsService
    this.logger.log(
      `Plan change requested for company ${companyId} to plan ${plan.slug}`,
    );
    return {
      message: `Plan change to ${plan.name} initiated. Stripe update pending.`,
    };
  }
}
