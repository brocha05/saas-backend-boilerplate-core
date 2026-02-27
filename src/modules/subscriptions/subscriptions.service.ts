import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { StripeService } from './stripe.service';
import { CreateSubscriptionDto, CreatePlanDto, UpdatePlanDto } from './dto';
import { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import {
  NotificationEvent,
  SubscriptionActivatedEvent,
  InvoicePaidEvent,
  PaymentFailedEvent,
  SubscriptionCanceledEvent,
} from '../notifications/events/notification.events';

// ─── Helpers ───────────────────────────────────────────────────────────────────
// In Stripe SDK v20 (API 2026-01-28.clover), current_period_start/end moved
// from the top-level Subscription object to the SubscriptionItem.
function getPeriodDates(sub: Stripe.Subscription): {
  periodStart: Date;
  periodEnd: Date;
} {
  const item = sub.items.data[0] as Stripe.SubscriptionItem | undefined;
  const start =
    item?.current_period_start ??
    sub.billing_cycle_anchor ??
    Math.floor(Date.now() / 1000);
  const end =
    item?.current_period_end ??
    Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  return {
    periodStart: new Date(start * 1000),
    periodEnd: new Date(end * 1000),
  };
}

// In Stripe SDK v20, Invoice.subscription was removed from the top level.
// The subscription ID now lives in invoice.parent.subscription_details.subscription.
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  async getSubscription(companyId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<Subscription | null>;
  }

  // ─── Admin Plan Management ─────────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        stripePriceId: dto.stripePriceId,
        stripeProductId: dto.stripeProductId,
        interval: dto.interval,
        price: dto.price,
        currency: dto.currency ?? 'usd',
        features: (dto.features ?? []) as Prisma.InputJsonValue,
        limits: (dto.limits ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.cache.del('plans:public');
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.stripePriceId !== undefined && {
          stripePriceId: dto.stripePriceId,
        }),
        ...(dto.stripeProductId !== undefined && {
          stripeProductId: dto.stripeProductId,
        }),
        ...(dto.interval !== undefined && { interval: dto.interval }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.features !== undefined && {
          features: dto.features as Prisma.InputJsonValue,
        }),
        ...(dto.limits !== undefined && {
          limits: dto.limits as Prisma.InputJsonValue,
        }),
      },
    });
    await this.cache.del('plans:public');
    return plan;
  }

  async deactivatePlan(id: string): Promise<{ message: string }> {
    await this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
    await this.cache.del('plans:public');
    return { message: 'Plan deactivated.' };
  }

  async getPublicPlans() {
    const cacheKey = 'plans:public';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        stripePriceId: true,
        interval: true,
        price: true,
        currency: true,
        features: true,
        limits: true,
      },
    });

    await this.cache.set(cacheKey, plans, 600); // 10 minutes
    return plans;
  }

  async createCheckoutSession(companyId: string, dto: CreateSubscriptionDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const plan = await this.prisma.plan.findFirst({
      where: { stripePriceId: dto.priceId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    // Create or retrieve Stripe customer
    let stripeCustomerId = company.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.createCustomer(
        await this.getAdminEmail(companyId),
        company.name,
      );
      stripeCustomerId = customer.id;
      await this.prisma.company.update({
        where: { id: companyId },
        data: { stripeCustomerId },
      });
    }

    const appUrl =
      this.configService.get<string>('app.url') ?? 'http://localhost:3000';

    const session = await this.stripe.createCheckoutSession(
      stripeCustomerId,
      plan.stripePriceId,
      `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      `${appUrl}/billing/cancel`,
    );

    return { url: session.url, sessionId: session.id };
  }

  async cancelSubscription(companyId: string): Promise<{ message: string }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'TRIALING'] } },
    });

    if (!subscription)
      throw new NotFoundException('No active subscription found');

    await this.stripe.cancelSubscription(subscription.stripeSubscriptionId);
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    return {
      message: 'Subscription will be canceled at the end of the billing period',
    };
  }

  async getBillingPortalUrl(companyId: string): Promise<{ url: string }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company?.stripeCustomerId) {
      throw new BadRequestException('No billing account found');
    }

    const appUrl =
      this.configService.get<string>('app.url') ?? 'http://localhost:3000';
    const session = await this.stripe.createBillingPortalSession(
      company.stripeCustomerId,
      `${appUrl}/settings/billing`,
    );

    return { url: session.url };
  }

  async getInvoices(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company?.stripeCustomerId) return [];
    return this.stripe.listInvoices(company.stripeCustomerId);
  }

  async resumeSubscription(companyId: string): Promise<{ message: string }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        cancelAtPeriodEnd: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription scheduled for cancellation');
    }

    await this.stripe.resumeSubscription(subscription.stripeSubscriptionId);
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    return { message: 'Subscription resumed successfully.' };
  }

  // ─── Webhook Handler ───────────────────────────────────────────────────────
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret =
      this.configService.get<string>('stripe.webhookSecret') ?? '';
    let event: Stripe.Event;

    try {
      event = this.stripe.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }

    // ── Idempotency: skip already-processed events (Stripe retries same event) ──
    const alreadyProcessed = await this.prisma.processedStripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (alreadyProcessed) {
      this.logger.debug(
        `Stripe event already processed, skipping: ${event.id}`,
      );
      return;
    }

    this.logger.log(`Stripe webhook received: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    // Mark as processed after successful handling
    await this.prisma.processedStripeEvent.create({
      data: { stripeEventId: event.id, type: event.type },
    });
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (!session.subscription || !session.customer) return;

    // In webhook payloads these are always string IDs (not expanded objects)
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const stripeCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer.id;

    const company = await this.prisma.company.findUnique({
      where: { stripeCustomerId },
    });

    if (!company) {
      this.logger.error(
        `Company not found for Stripe customer: ${stripeCustomerId}`,
      );
      return;
    }

    const stripeSubscription =
      await this.stripe.retrieveSubscription(stripeSubscriptionId);
    const stripePriceId = stripeSubscription.items.data[0]?.price.id;

    const plan = stripePriceId
      ? await this.prisma.plan.findUnique({ where: { stripePriceId } })
      : null;

    if (!plan) {
      this.logger.error(
        `Plan not found for Stripe price: ${String(stripePriceId)}`,
      );
      return;
    }

    const { periodStart, periodEnd } = getPeriodDates(stripeSubscription);

    await this.prisma.subscription.upsert({
      where: { stripeSubscriptionId },
      create: {
        companyId: company.id,
        planId: plan.id,
        stripeSubscriptionId,
        status: this.mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      update: {
        status: this.mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });

    this.logger.log(`Subscription activated for company: ${company.slug}`);

    const activatedEvent = new SubscriptionActivatedEvent();
    activatedEvent.companyId = company.id;
    activatedEvent.planName = plan.name;
    this.eventEmitter.emit(
      NotificationEvent.SUBSCRIPTION_ACTIVATED,
      activatedEvent,
    );
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return;

    const stripeSubscription =
      await this.stripe.retrieveSubscription(stripeSubscriptionId);
    const { periodStart, periodEnd } = getPeriodDates(stripeSubscription);

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });

    if (subscription) {
      const paidEvent = new InvoicePaidEvent();
      paidEvent.companyId = subscription.companyId;
      paidEvent.amountPaid = invoice.amount_paid ?? 0;
      paidEvent.currency = invoice.currency ?? 'usd';
      paidEvent.periodEnd = periodEnd;
      paidEvent.invoicePdfUrl = invoice.invoice_pdf ?? undefined;
      this.eventEmitter.emit(NotificationEvent.INVOICE_PAID, paidEvent);
    }
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
  ): Promise<void> {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { status: 'PAST_DUE' },
    });

    this.logger.warn(
      `Payment failed for subscription: ${stripeSubscriptionId}`,
    );

    if (subscription) {
      const failedEvent = new PaymentFailedEvent();
      failedEvent.companyId = subscription.companyId;
      failedEvent.amountDue = invoice.amount_due ?? 0;
      failedEvent.currency = invoice.currency ?? 'usd';
      // next_payment_attempt is a Unix timestamp (seconds) or null
      failedEvent.nextRetryAt = invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000)
        : undefined;
      this.eventEmitter.emit(NotificationEvent.PAYMENT_FAILED, failedEvent);
    }
  }

  private async handleSubscriptionUpdated(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const stripePriceId =
      stripeSubscription.items.data[0]?.price.id ?? undefined;
    const plan = stripePriceId
      ? await this.prisma.plan.findUnique({ where: { stripePriceId } })
      : null;

    const { periodStart, periodEnd } = getPeriodDates(stripeSubscription);

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubscription.id },
      data: {
        status: this.mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        ...(plan && { planId: plan.id }),
      },
    });
  }

  private async handleSubscriptionDeleted(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubscription.id },
      include: { plan: true },
    });

    await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSubscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    if (subscription) {
      const canceledEvent = new SubscriptionCanceledEvent();
      canceledEvent.companyId = subscription.companyId;
      canceledEvent.planName = (subscription as any).plan?.name ?? 'your plan';
      canceledEvent.cancelAt = stripeSubscription.cancel_at
        ? new Date(stripeSubscription.cancel_at * 1000)
        : new Date();
      this.eventEmitter.emit(
        NotificationEvent.SUBSCRIPTION_CANCELED,
        canceledEvent,
      );
    }
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELED',
      incomplete: 'INCOMPLETE',
      incomplete_expired: 'CANCELED',
      trialing: 'TRIALING',
      unpaid: 'UNPAID',
    };
    return map[status] ?? 'INCOMPLETE';
  }

  private async getAdminEmail(companyId: string): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { companyId, role: 'ADMIN', deletedAt: null },
    });
    return admin?.email ?? 'admin@example.com';
  }
}
