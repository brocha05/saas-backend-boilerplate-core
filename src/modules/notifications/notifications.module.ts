import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../../prisma/prisma.module';

import { SesService } from './email/ses.service';
import { EmailService } from './email/email.service';
import { NotificationListeners } from './events/notification.listeners';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [SesService, EmailService, NotificationListeners],
  exports: [EmailService],
})
export class NotificationsModule {}
