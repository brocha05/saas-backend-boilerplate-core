import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../prisma/prisma.service';
import { SesService } from './ses.service';

export interface SendOptions {
  /** Event key used to categorize the email log */
  event: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string;
  companyId?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  readonly appUrl: string;
  readonly appName: string;

  constructor(
    private readonly ses: SesService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('app.url') ?? 'http://localhost:3000';
    this.appName = this.config.get<string>('app.name') ?? 'My SaaS';
  }

  /**
   * Send an email via SES and write an EmailLog record.
   * Errors are swallowed — email failures never propagate to the caller.
   */
  async send(options: SendOptions): Promise<void> {
    const { event, to, subject, html, text, userId, companyId } = options;

    const log = await this.prisma.emailLog.create({
      data: {
        event,
        recipient: to,
        subject,
        status: 'PENDING',
        userId: userId ?? null,
        companyId: companyId ?? null,
      },
    });

    try {
      await this.ses.sendEmail({ to, subject, html, text });

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: (err as Error).message },
      });
      this.logger.error(
        `Email send failed: event="${event}" to="${to}"`,
        (err as Error).stack,
      );
    }
  }

  /** Base context shared by all templates */
  baseContext() {
    return {
      appName: this.appName,
      appUrl: this.appUrl,
    };
  }
}
