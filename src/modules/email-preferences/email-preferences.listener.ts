import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationEvent,
  UserRegisteredEvent,
} from '../notifications/events/notification.events';

/**
 * Creates a default EmailPreference record whenever a new user registers so
 * that every user has a preference row from day one (and an unsubscribe token
 * ready to embed in the first welcome email).
 */
@Injectable()
export class EmailPreferencesListener {
  private readonly logger = new Logger(EmailPreferencesListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(NotificationEvent.USER_REGISTERED, { async: true })
  async onUserRegistered(event: UserRegisteredEvent): Promise<void> {
    try {
      await this.prisma.emailPreference.upsert({
        where: { userId: event.userId },
        create: {
          userId: event.userId,
          unsubscribeToken: randomBytes(32).toString('hex'),
        },
        update: {}, // already exists — keep existing preferences
      });
    } catch (err) {
      this.logger.warn(
        `Failed to create email preferences for user ${event.userId}: ${(err as Error).message}`,
      );
    }
  }
}
