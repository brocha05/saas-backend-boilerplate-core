import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingListener } from './onboarding.listener';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingListener],
  exports: [OnboardingService],
})
export class OnboardingModule {}
