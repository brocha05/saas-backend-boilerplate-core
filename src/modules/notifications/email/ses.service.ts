import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-ses';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class SesService {
  private readonly client: SESClient;
  private readonly fromAddress: string;
  private readonly logger = new Logger(SesService.name);

  constructor(private readonly config: ConfigService) {
    this.client = new SESClient({
      region: this.config.get<string>('ses.region') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('ses.accessKeyId') ?? '',
        secretAccessKey: this.config.get<string>('ses.secretAccessKey') ?? '',
      },
    });

    const fromEmail =
      this.config.get<string>('ses.fromEmail') ?? 'noreply@example.com';
    const fromName = this.config.get<string>('ses.fromName') ?? 'My SaaS';
    this.fromAddress = `${fromName} <${fromEmail}>`;
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const { to, subject, html, text } = options;

    const input: SendEmailCommandInput = {
      Source: this.fromAddress,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          ...(text && { Text: { Data: text, Charset: 'UTF-8' } }),
        },
      },
    };

    await this.client.send(new SendEmailCommand(input));
    this.logger.debug(`Email sent via SES to ${to} — "${subject}"`);
  }
}
