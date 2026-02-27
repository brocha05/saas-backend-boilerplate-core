import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeService } from './stripe.service';
import { ActiveSubscriptionGuard } from './guards/active-subscription.guard';

@Module({
  imports: [ConfigModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, StripeService, ActiveSubscriptionGuard],
  exports: [SubscriptionsService, StripeService, ActiveSubscriptionGuard],
})
export class SubscriptionsModule {}
