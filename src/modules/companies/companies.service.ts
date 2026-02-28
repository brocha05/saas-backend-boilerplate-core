import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { S3Service } from '../files/s3.service';
import { StripeService } from '../subscriptions/stripe.service';
import { UpdateCompanyDto, InviteUserDto } from './dto';
import { Company, User } from '@prisma/client';
import {
  NotificationEvent,
  UserInvitedEvent,
} from '../notifications/events/notification.events';
import type { MulterFile } from '../../common/interfaces';

const COMPANY_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
    private readonly s3: S3Service,
    private readonly stripe: StripeService,
  ) {}

  async findById(id: string): Promise<Company> {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findWithSubscription(id: string) {
    const cacheKey = `company:${id}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

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

    await this.cache.set(cacheKey, company, COMPANY_CACHE_TTL);
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    await this.findById(id);
    const updated = await this.prisma.company.update({
      where: { id },
      data: dto,
    });
    await this.cache.del(`company:${id}`);
    return updated;
  }

  async getMembers(companyId: string): Promise<Omit<User, 'password'>[]> {
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

    // Check for an existing pending invitation for this email + company
    const pendingInvite = await this.prisma.invitationToken.findFirst({
      where: {
        email: dto.email,
        companyId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvite) {
      throw new ConflictException(
        'A pending invitation already exists for this email',
      );
    }

    const [inviter, company] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: inviterId } }),
      this.findById(companyId),
    ]);

    // Generate a secure token for the accept-invite flow
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.invitationToken.create({
      data: {
        token,
        email: dto.email,
        companyId,
        invitedBy: inviterId,
        role: dto.role ?? 'MEMBER',
        expiresAt,
      },
    });

    const notifEvent = new UserInvitedEvent();
    notifEvent.inviteeEmail = dto.email;
    notifEvent.companyId = companyId;
    notifEvent.companyName = company.name;
    notifEvent.inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`
      : 'A team member';
    notifEvent.inviteToken = token;
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
    await this.cache.del(`company:${companyId}`);
    this.logger.log(`Company ${companyId} soft-deleted`);
  }

  async uploadLogo(
    companyId: string,
    file: MulterFile,
  ): Promise<{ key: string; url: string }> {
    await this.findById(companyId);

    const ext = extname(file.originalname).toLowerCase();
    const key = `${companyId}/logos/${randomUUID()}${ext}`;

    await this.s3.upload(key, file.buffer, file.mimetype, {
      companyId,
      resource: 'company-logo',
    });

    // Presigned download URL valid for 1 hour (for immediate display)
    const url = await this.s3.getPresignedDownloadUrl(key, 3600);

    await this.prisma.company.update({
      where: { id: companyId },
      data: { logoUrl: key }, // store key; generate fresh URLs as needed
    });

    // Invalidate company cache so next read picks up new logoUrl
    await this.cache.del(`company:${companyId}`);

    return { key, url };
  }

  async changePlan(
    companyId: string,
    planId: string,
  ): Promise<{ message: string }> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'TRIALING'] } },
    });
    if (!subscription) {
      throw new BadRequestException(
        'No active subscription found. Create a subscription first.',
      );
    }

    await this.stripe.updateSubscription(
      subscription.stripeSubscriptionId,
      plan.stripePriceId,
    );

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { planId: plan.id },
    });

    // Stripe will fire customer.subscription.updated webhook which syncs status/period
    await this.cache.del(`company:${companyId}`);

    this.logger.log(
      `Plan changed for company ${companyId} to ${plan.slug} (Stripe updated)`,
    );

    return {
      message: `Plan changed to ${plan.name}. Stripe update applied immediately with proration.`,
    };
  }
}
