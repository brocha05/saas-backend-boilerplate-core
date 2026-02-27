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
  /**
   * When present the user's unsubscribe token is injected into the email footer
   * as a one-click opt-out link (CAN-SPAM / GDPR compliance).
   * Omit for transactional emails (password reset, security alerts).
   */
  unsubscribeToken?: string;
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
    this.appUrl =
      this.config.get<string>('app.url') ?? 'http://localhost:3000';
    this.appName = this.config.get<string>('app.name') ?? 'My SaaS';
  }

  /**
   * Send an email via SES and write an EmailLog record.
   * Errors are swallowed — email failures never propagate to the caller.
   */
  async send(options: SendOptions): Promise<void> {
    const { event, to, subject, html, text, userId, companyId, unsubscribeToken } = options;

    // Inject unsubscribe footer for non-transactional emails
    let finalHtml = html;
    if (unsubscribeToken) {
      const unsubUrl = `${this.appUrl}/settings/email-preferences?token=${unsubscribeToken}`;
      const footer =
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">` +
        `<tr><td align="center" style="padding:16px 0;">` +
        `<p style="color:#9ca3af;font-size:11px;margin:0;line-height:1.6;">` +
        `You are receiving this email because you have an account with ${this.appName}.<br />` +
        `<a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Manage email preferences</a>` +
        ` &nbsp;·&nbsp; ` +
        `<a href="${this.appUrl}/email-preferences/unsubscribe-all/${unsubscribeToken}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from all</a>` +
        `</p></td></tr></table>`;
      finalHtml = html.replace('</body>', `${footer}</body>`);
    }

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
      await this.ses.sendEmail({ to, subject, html: finalHtml, text });

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
