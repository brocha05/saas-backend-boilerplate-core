import { Module } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { UsageLimitGuard } from './guards/usage-limit.guard';
import { UsageTrackingInterceptor } from './interceptors/usage-tracking.interceptor';

/**
 * UsageModule — plan metering and enforcement.
 *
 * Exports UsageService so SubscriptionsService can call resetCurrentPeriod()
 * when a Stripe invoice.paid event fires (billing period renewal).
 *
 * UsageLimitGuard and UsageTrackingInterceptor are registered globally in
 * AppModule via APP_GUARD / APP_INTERCEPTOR so they are available everywhere
 * without explicit module imports.
 */
@Module({
  providers: [UsageService, UsageLimitGuard, UsageTrackingInterceptor],
  controllers: [UsageController],
  exports: [UsageService],
})
export class UsageModule {}
