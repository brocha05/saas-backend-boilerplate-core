export class OnboardingStepDto {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  completedAt?: Date;
}

export class OnboardingStatusDto {
  steps: OnboardingStepDto[];
  completedCount: number;
  totalCount: number;
  /** Integer 0-100 */
  percentComplete: number;
  isComplete: boolean;
}
