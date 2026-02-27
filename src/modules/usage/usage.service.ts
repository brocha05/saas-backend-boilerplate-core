import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RATE_METRICS,
  GAUGE_METRICS,
  UsageMetric,
} from './usage-metrics';
import type { UsageSummaryDto, MetricUsageDto } from './dto';

type PlanLimits = Record<string, number | null>;

const ALL_METRICS = [
  UsageMetric.API_CALLS,
  UsageMetric.FILES_UPLOADED,
  UsageMetric.TEAM_MEMBERS,
  UsageMetric.STORAGE_BYTES,
];

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Period helpers ────────────────────────────────────────────────────────

  getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // ─── Increment (rate metrics only) ────────────────────────────────────────

  /**
   * Atomically increments a rate metric for the current billing period.
   * No-op for gauge metrics (they are computed from DB).
   */
  async increment(
    companyId: string,
    metric: string,
    amount = 1,
  ): Promise<void> {
    if (!RATE_METRICS.has(metric)) return;

    const period = this.getCurrentPeriod();

    await this.prisma.usageMeter.upsert({
      where: { companyId_metric_period: { companyId, metric, period } },
      update: { count: { increment: amount } },
      create: { companyId, metric, period, count: amount },
    });
  }

  // ─── Check limit ──────────────────────────────────────────────────────────

  /**
   * Checks whether the company is within its plan limit for a given metric.
   * Returns { allowed, current, limit } — limit is null when unlimited.
   */
  async checkLimit(
    companyId: string,
    metric: string,
  ): Promise<{ allowed: boolean; current: number; limit: number | null }> {
    const [planLimits, current] = await Promise.all([
      this.getPlanLimits(companyId),
      this.getCurrentUsage(companyId, metric),
    ]);

    const limit = planLimits[metric] ?? null;
    return { allowed: limit === null || current < limit, current, limit };
  }

  // ─── Usage summary ────────────────────────────────────────────────────────

  async getUsageSummary(companyId: string): Promise<UsageSummaryDto> {
    const period = this.getCurrentPeriod();

    const [planInfo, meters, teamMembers, storageResult] = await Promise.all([
      this.getActivePlanInfo(companyId),
      this.prisma.usageMeter.findMany({
        where: { companyId, period },
      }),
      this.prisma.user.count({
        where: { companyId, deletedAt: null },
      }),
      this.prisma.file.aggregate({
        where: { companyId, deletedAt: null },
        _sum: { size: true },
      }),
    ]);

    const limits = planInfo?.limits ?? {};

    const rateMap = new Map(meters.map((m) => [m.metric, m.count]));

    const gaugeValues: Record<string, number> = {
      [UsageMetric.TEAM_MEMBERS]: teamMembers,
      [UsageMetric.STORAGE_BYTES]: storageResult._sum.size ?? 0,
    };

    const metrics: Record<string, MetricUsageDto> = {};

    for (const metric of ALL_METRICS) {
      const current = GAUGE_METRICS.has(metric)
        ? gaugeValues[metric]
        : (rateMap.get(metric) ?? 0);

      const limit = (limits[metric] as number | null | undefined) ?? null;
      metrics[metric] = { current, limit, unlimited: limit === null };
    }

    return {
      period,
      companyId,
      planName: planInfo?.name,
      metrics,
    };
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  /**
   * Resets all rate-metric counters for the current billing period.
   * Called automatically when a new invoice is paid (subscription renewal)
   * and can also be triggered manually via the API.
   */
  async resetCurrentPeriod(companyId: string): Promise<void> {
    const period = this.getCurrentPeriod();
    await this.prisma.usageMeter.updateMany({
      where: { companyId, period },
      data: { count: 0 },
    });
    this.logger.log(
      `Usage reset for company=${companyId} period=${period}`,
    );
  }

  /**
   * Resets a single rate metric for the current billing period.
   */
  async resetMetric(companyId: string, metric: string): Promise<void> {
    if (!RATE_METRICS.has(metric)) {
      throw new NotFoundException(
        `"${metric}" is a gauge metric and cannot be manually reset`,
      );
    }
    const period = this.getCurrentPeriod();
    await this.prisma.usageMeter.upsert({
      where: { companyId_metric_period: { companyId, metric, period } },
      update: { count: 0 },
      create: { companyId, metric, period, count: 0 },
    });
    this.logger.log(
      `Metric reset: company=${companyId} metric=${metric} period=${period}`,
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getPlanLimits(companyId: string): Promise<PlanLimits> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { plan: { select: { limits: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return (subscription?.plan?.limits ?? {}) as PlanLimits;
  }

  private async getActivePlanInfo(
    companyId: string,
  ): Promise<{ name: string; limits: PlanLimits } | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId, status: { in: ['ACTIVE', 'TRIALING'] } },
      select: { plan: { select: { name: true, limits: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) return null;
    return {
      name: subscription.plan.name,
      limits: (subscription.plan.limits ?? {}) as PlanLimits,
    };
  }

  private async getCurrentUsage(
    companyId: string,
    metric: string,
  ): Promise<number> {
    if (GAUGE_METRICS.has(metric)) {
      return this.computeGauge(companyId, metric);
    }
    const period = this.getCurrentPeriod();
    const meter = await this.prisma.usageMeter.findUnique({
      where: { companyId_metric_period: { companyId, metric, period } },
    });
    return meter?.count ?? 0;
  }

  private async computeGauge(
    companyId: string,
    metric: string,
  ): Promise<number> {
    if (metric === UsageMetric.TEAM_MEMBERS) {
      return this.prisma.user.count({
        where: { companyId, deletedAt: null },
      });
    }
    if (metric === UsageMetric.STORAGE_BYTES) {
      const result = await this.prisma.file.aggregate({
        where: { companyId, deletedAt: null },
        _sum: { size: true },
      });
      return result._sum.size ?? 0;
    }
    return 0;
  }
}
