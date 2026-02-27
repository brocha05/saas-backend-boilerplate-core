import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../prisma/prisma.module';

import { SesService } from './email/ses.service';
import { EmailService } from './email/email.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationListeners } from './events/notification.listeners';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [NotificationsController],
  providers: [
    SesService,
    EmailService,
    NotificationsService,
    NotificationListeners,
  ],
  // Export so other modules can inject EmailService or NotificationsService if needed
  exports: [EmailService, NotificationsService],
})
export class NotificationsModule {}
