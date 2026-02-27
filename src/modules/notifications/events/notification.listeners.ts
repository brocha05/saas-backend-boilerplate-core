import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import {
  NotificationEvent,
  UserRegisteredEvent,
  EmailVerificationRequestedEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
  UserInvitedEvent,
  SubscriptionActivatedEvent,
  InvoicePaidEvent,
  PaymentFailedEvent,
  SubscriptionCanceledEvent,
} from './notification.events';

import { welcomeTemplate } from '../email/templates/welcome.template';
import { emailVerificationTemplate } from '../email/templates/email-verification.template';
import {
  passwordResetTemplate,
  passwordResetCompletedTemplate,
} from '../email/templates/password-reset.template';
import { inviteUserTemplate } from '../email/templates/invite-user.template';
import { subscriptionActivatedTemplate } from '../email/templates/subscription-activated.template';
import { invoicePaidTemplate } from '../email/templates/invoice-paid.template';
import { paymentFailedTemplate } from '../email/templates/payment-failed.template';
import { subscriptionCanceledTemplate } from '../email/templates/subscription-canceled.template';

@Injectable()
export class NotificationListeners {
  private readonly logger = new Logger(NotificationListeners.name);

  constructor(
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  @OnEvent(NotificationEvent.USER_REGISTERED, { async: true })
  async onUserRegistered(event: UserRegisteredEvent): Promise<void> {
    try {
      const template = welcomeTemplate({
        ...this.email.baseContext(),
        firstName: event.firstName,
        companyName: event.companyName,
      });

      await this.email.send({
        event: NotificationEvent.USER_REGISTERED,
        to: event.email,
        ...template,
        userId: event.userId,
        companyId: event.companyId,
      });
    } catch (err) {
      this.logger.error(
        'onUserRegistered handler failed',
        (err as Error).stack,
      );
    }
  }

  @OnEvent(NotificationEvent.EMAIL_VERIFICATION_REQUESTED, { async: true })
  async onEmailVerificationRequested(
    event: EmailVerificationRequestedEvent,
  ): Promise<void> {
    try {
      const verifyUrl = `${this.email.appUrl}/auth/confirm-email?token=${event.verificationToken}`;

      const template = emailVerificationTemplate({
        ...this.email.baseContext(),
        firstName: event.firstName,
        verifyUrl,
        expiresInHours: 24,
      });

      await this.email.send({
        event: NotificationEvent.EMAIL_VERIFICATION_REQUESTED,
        to: event.email,
        ...template,
        userId: event.userId,
      });
    } catch (err) {
      this.logger.error(
        'onEmailVerificationRequested handler failed',
        (err as Error).stack,
      );
    }
  }

  @OnEvent(NotificationEvent.PASSWORD_RESET_REQUESTED, { async: true })
  async onPasswordResetRequested(
    event: PasswordResetRequestedEvent,
  ): Promise<void> {
    try {
      const resetUrl = `${this.email.appUrl}/auth/reset-password?token=${event.resetToken}`;

      const template = passwordResetTemplate({
        ...this.email.baseContext(),
        firstName: event.firstName,
        resetUrl,
        expiresInMinutes: 60,
      });

      await this.email.send({
        event: NotificationEvent.PASSWORD_RESET_REQUESTED,
        to: event.email,
        ...template,
        userId: event.userId,
      });
    } catch (err) {
      this.logger.error(
        'onPasswordResetRequested handler failed',
        (err as Error).stack,
      );
    }
  }

  @OnEvent(NotificationEvent.PASSWORD_RESET_COMPLETED, { async: true })
  async onPasswordResetCompleted(
    event: PasswordResetCompletedEvent,
  ): Promise<void> {
    try {
      const template = passwordResetCompletedTemplate({
        ...this.email.baseContext(),
        firstName: event.firstName,
      });

      await this.email.send({
        event: NotificationEvent.PASSWORD_RESET_COMPLETED,
        to: event.email,
        ...template,
        userId: event.userId,
      });
    } catch (err) {
      this.logger.error(
        'onPasswordResetCompleted handler failed',
        (err as Error).stack,
      );
    }
  }

  // ─── Users / Invite ────────────────────────────────────────────────────────

  @OnEvent(NotificationEvent.USER_INVITED, { async: true })
  async onUserInvited(event: UserInvitedEvent): Promise<void> {
    try {
      const acceptUrl = event.inviteToken
        ? `${this.email.appUrl}/auth/accept-invite?token=${event.inviteToken}`
        : `${this.email.appUrl}/auth/login`;

      const template = inviteUserTemplate({
        ...this.email.baseContext(),
        inviteeName: event.inviteeName,
        inviterName: event.inviterName,
        companyName: event.companyName,
        acceptUrl,
      });

      await this.email.send({
        event: NotificationEvent.USER_INVITED,
        to: event.inviteeEmail,
        ...template,
        companyId: event.companyId,
      });
    } catch (err) {
      this.logger.error('onUserInvited handler failed', (err as Error).stack);
    }
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  @OnEvent(NotificationEvent.SUBSCRIPTION_ACTIVATED, { async: true })
  async onSubscriptionActivated(
    event: SubscriptionActivatedEvent,
  ): Promise<void> {
    try {
      const company = await this.getCompanyWithAdmins(event.companyId);
      if (!company) return;

      for (const admin of company.users) {
        const template = subscriptionActivatedTemplate({
          ...this.email.baseContext(),
          firstName: admin.firstName,
          companyName: company.name,
          planName: event.planName,
        });

        await this.email.send({
          event: NotificationEvent.SUBSCRIPTION_ACTIVATED,
          to: admin.email,
          ...template,
          userId: admin.id,
          companyId: event.companyId,
        });
      }
    } catch (err) {
      this.logger.error(
        'onSubscriptionActivated handler failed',
        (err as Error).stack,
      );
    }
  }

  @OnEvent(NotificationEvent.INVOICE_PAID, { async: true })
  async onInvoicePaid(event: InvoicePaidEvent): Promise<void> {
    try {
      const company = await this.getCompanyWithAdmins(event.companyId);
      if (!company) return;

      for (const admin of company.users) {
        const template = invoicePaidTemplate({
          ...this.email.baseContext(),
          firstName: admin.firstName,
          companyName: company.name,
          amountPaid: event.amountPaid,
          currency: event.currency,
          periodEnd: event.periodEnd,
          invoicePdfUrl: event.invoicePdfUrl,
        });

        await this.email.send({
          event: NotificationEvent.INVOICE_PAID,
          to: admin.email,
          ...template,
          userId: admin.id,
          companyId: event.companyId,
        });
      }
    } catch (err) {
      this.logger.error('onInvoicePaid handler failed', (err as Error).stack);
    }
  }

  @OnEvent(NotificationEvent.PAYMENT_FAILED, { async: true })
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      const company = await this.getCompanyWithAdmins(event.companyId);
      if (!company) return;

      const updatePaymentUrl = `${this.email.appUrl}/settings/billing`;

      for (const admin of company.users) {
        const template = paymentFailedTemplate({
          ...this.email.baseContext(),
          firstName: admin.firstName,
          companyName: company.name,
          amountDue: event.amountDue,
          currency: event.currency,
          nextRetryAt: event.nextRetryAt,
          updatePaymentUrl,
        });

        await this.email.send({
          event: NotificationEvent.PAYMENT_FAILED,
          to: admin.email,
          ...template,
          userId: admin.id,
          companyId: event.companyId,
        });
      }
    } catch (err) {
      this.logger.error('onPaymentFailed handler failed', (err as Error).stack);
    }
  }

  @OnEvent(NotificationEvent.SUBSCRIPTION_CANCELED, { async: true })
  async onSubscriptionCanceled(
    event: SubscriptionCanceledEvent,
  ): Promise<void> {
    try {
      const company = await this.getCompanyWithAdmins(event.companyId);
      if (!company) return;

      const reactivateUrl = `${this.email.appUrl}/settings/billing`;

      for (const admin of company.users) {
        const template = subscriptionCanceledTemplate({
          ...this.email.baseContext(),
          firstName: admin.firstName,
          companyName: company.name,
          planName: event.planName,
          cancelAt: event.cancelAt,
          reactivateUrl,
        });

        await this.email.send({
          event: NotificationEvent.SUBSCRIPTION_CANCELED,
          to: admin.email,
          ...template,
          userId: admin.id,
          companyId: event.companyId,
        });
      }
    } catch (err) {
      this.logger.error(
        'onSubscriptionCanceled handler failed',
        (err as Error).stack,
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async getCompanyWithAdmins(companyId: string) {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        users: {
          where: { role: 'ADMIN', isActive: true, deletedAt: null },
          select: { id: true, email: true, firstName: true },
        },
      },
    });
  }
}
