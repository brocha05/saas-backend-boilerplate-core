import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OnboardingStepKey,
  ONBOARDING_STEP_META,
  ORDERED_STEP_KEYS,
  OnboardingStepKeyType,
} from './onboarding-step.constants';
import { OnboardingStatusDto } from './dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(companyId: string): Promise<OnboardingStatusDto> {
    const completed = await this.prisma.onboardingStep.findMany({
      where: { companyId },
    });

    const completedMap = new Map(
      completed.map((s) => [s.step, s.completedAt]),
    );

    const steps = ORDERED_STEP_KEYS.map((key) => {
      const meta = ONBOARDING_STEP_META[key];
      const completedAt = completedMap.get(key);
      return {
        key,
        label: meta.label,
        description: meta.description,
        completed: !!completedAt,
        ...(completedAt ? { completedAt } : {}),
      };
    });

    const completedCount = steps.filter((s) => s.completed).length;
    const totalCount = steps.length;

    return {
      steps,
      completedCount,
      totalCount,
      percentComplete: Math.round((completedCount / totalCount) * 100),
      isComplete: completedCount === totalCount,
    };
  }

  async completeStep(companyId: string, step: string): Promise<void> {
    const validKeys = Object.values(OnboardingStepKey) as string[];
    if (!validKeys.includes(step)) {
      throw new BadRequestException(`Unknown onboarding step: ${step}`);
    }

    await this.prisma.onboardingStep.upsert({
      where: { companyId_step: { companyId, step } },
      create: { companyId, step },
      update: {}, // already completed — no-op
    });
  }

  /** Reset a completed step (e.g., for testing or re-onboarding). */
  async resetStep(companyId: string, step: string): Promise<void> {
    const validKeys = Object.values(OnboardingStepKey) as string[];
    if (!validKeys.includes(step)) {
      throw new BadRequestException(`Unknown onboarding step: ${step}`);
    }

    await this.prisma.onboardingStep.deleteMany({
      where: { companyId, step },
    });
  }

  /** Mark all steps for a company as complete (admin utility). */
  async completeAll(companyId: string): Promise<void> {
    const data = (Object.values(OnboardingStepKey) as OnboardingStepKeyType[]).map(
      (step) => ({ companyId, step }),
    );

    // Upsert each step — safe to call repeatedly
    await Promise.all(
      data.map((d) =>
        this.prisma.onboardingStep.upsert({
          where: { companyId_step: { companyId: d.companyId, step: d.step } },
          create: d,
          update: {},
        }),
      ),
    );
  }
}
