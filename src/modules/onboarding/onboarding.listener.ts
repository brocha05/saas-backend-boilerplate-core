import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OnboardingService } from './onboarding.service';
import { OnboardingStepKey } from './onboarding-step.constants';
import {
  NotificationEvent,
  SubscriptionActivatedEvent,
  InvoicePaidEvent,
  UserInvitedEvent,
} from '../notifications/events/notification.events';

/**
 * Listens to domain events emitted by other modules and auto-completes the
 * corresponding onboarding steps so users don't have to tick them manually.
 */
@Injectable()
export class OnboardingListener {
  private readonly logger = new Logger(OnboardingListener.name);

  constructor(private readonly onboarding: OnboardingService) {}

  @OnEvent(NotificationEvent.SUBSCRIPTION_ACTIVATED)
  async onSubscriptionActivated(event: SubscriptionActivatedEvent): Promise<void> {
    await this.completeStep(event.companyId, OnboardingStepKey.CHOOSE_PLAN);
  }

  @OnEvent(NotificationEvent.INVOICE_PAID)
  async onInvoicePaid(event: InvoicePaidEvent): Promise<void> {
    await this.completeStep(event.companyId, OnboardingStepKey.ADD_PAYMENT_METHOD);
  }

  @OnEvent(NotificationEvent.USER_INVITED)
  async onUserInvited(event: UserInvitedEvent): Promise<void> {
    await this.completeStep(event.companyId, OnboardingStepKey.INVITE_TEAM_MEMBER);
  }

  private async completeStep(companyId: string, step: string): Promise<void> {
    try {
      await this.onboarding.completeStep(companyId, step);
      this.logger.debug(`Auto-completed onboarding step "${step}" for company ${companyId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to auto-complete onboarding step "${step}" for company ${companyId}: ${(err as Error).message}`,
      );
    }
  }
}
