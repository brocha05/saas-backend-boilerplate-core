import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';

/** Processed Stripe events are kept for this many days (idempotency window). */
const STRIPE_EVENT_RETENTION_DAYS = 90;

/**
 * Audit logs and email logs older than this many days are purged.
 * Adjust to meet your compliance requirements.
 */
const LOG_RETENTION_DAYS = 90;

/** Usage meter rows older than this many months are purged (keep ~13 months of history). */
const USAGE_METER_RETENTION_MONTHS = 13;

@Injectable()
export class DataRetentionTask {
  private readonly logger = new Logger(DataRetentionTask.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs every Sunday at 03:00.
   * Cleans up tables that grow unboundedly over time:
   *   - ProcessedStripeEvent  (idempotency store — safe to drop after retention window)
   *   - AuditLog              (compliance logs — adjust retention to your policy)
   *   - EmailLog              (delivery audit — adjust retention to your policy)
   */
  @Cron('0 3 * * 0')
  async runDataRetention(): Promise<void> {
    const start = Date.now();
    this.logger.log('Data retention job started');

    try {
      const stripeEventCutoff = new Date(
        Date.now() - STRIPE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const logCutoff = new Date(
        Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );

      // Usage meters: keep 13 months of history (current month + 12 past)
      const usageCutoffDate = new Date();
      usageCutoffDate.setMonth(
        usageCutoffDate.getMonth() - USAGE_METER_RETENTION_MONTHS,
      );
      const usageCutoffPeriod = `${usageCutoffDate.getFullYear()}-${String(usageCutoffDate.getMonth() + 1).padStart(2, '0')}`;

      const [stripeEvents, auditLogs, emailLogs, usageMeters] =
        await Promise.all([
          this.prisma.processedStripeEvent.deleteMany({
            where: { processedAt: { lt: stripeEventCutoff } },
          }),
          this.prisma.auditLog.deleteMany({
            where: { createdAt: { lt: logCutoff } },
          }),
          this.prisma.emailLog.deleteMany({
            where: { createdAt: { lt: logCutoff } },
          }),
          this.prisma.usageMeter.deleteMany({
            where: { period: { lt: usageCutoffPeriod } },
          }),
        ]);

      this.logger.log(
        `Data retention done in ${Date.now() - start}ms — ` +
          `${stripeEvents.count} stripe events, ` +
          `${auditLogs.count} audit logs, ` +
          `${emailLogs.count} email logs, ` +
          `${usageMeters.count} usage meter rows purged`,
      );
    } catch (err) {
      this.logger.error('Data retention job failed', err);
    }
  }
}
