import { applyDecorators } from '@nestjs/common';
import { TrackUsage } from './track-usage.decorator';
import { CheckLimit } from './check-limit.decorator';

/**
 * Composite decorator that combines @CheckLimit and @TrackUsage for a metric.
 *
 * - **Before** the handler: UsageLimitGuard checks the company's plan limit.
 * - **After** a successful response: UsageTrackingInterceptor increments the counter.
 *
 * @example
 * \@Metered(UsageMetric.FILES_UPLOADED)
 * \@Post('upload')
 * upload() { ... }
 */
export const Metered = (metric: string) =>
  applyDecorators(CheckLimit(metric), TrackUsage(metric));
