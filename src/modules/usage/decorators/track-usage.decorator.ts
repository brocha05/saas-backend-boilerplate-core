import { SetMetadata } from '@nestjs/common';

export const TRACK_USAGE_KEY = 'trackUsage';

/**
 * Marks a handler so that UsageTrackingInterceptor increments the given metric
 * after a **successful** response (i.e. no exception thrown).
 *
 * @example
 * \@TrackUsage(UsageMetric.FILES_UPLOADED)
 * \@Post('upload')
 * upload() { ... }
 */
export const TrackUsage = (metric: string) =>
  SetMetadata(TRACK_USAGE_KEY, metric);
