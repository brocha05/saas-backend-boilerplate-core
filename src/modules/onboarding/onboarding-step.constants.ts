// ─── Onboarding Step Keys ────────────────────────────────────────────────────

export const OnboardingStepKey = {
  VERIFY_EMAIL: 'verify_email',
  COMPLETE_PROFILE: 'complete_profile',
  INVITE_TEAM_MEMBER: 'invite_team_member',
  CHOOSE_PLAN: 'choose_plan',
  ADD_PAYMENT_METHOD: 'add_payment_method',
  UPLOAD_LOGO: 'upload_logo',
} as const;

export type OnboardingStepKeyType =
  (typeof OnboardingStepKey)[keyof typeof OnboardingStepKey];

export const ONBOARDING_STEP_META: Record<
  OnboardingStepKeyType,
  { label: string; description: string; order: number }
> = {
  verify_email: {
    label: 'Verify your email',
    description: 'Confirm your email address to secure your account.',
    order: 1,
  },
  complete_profile: {
    label: 'Complete your profile',
    description: 'Fill in your company name and other account details.',
    order: 2,
  },
  invite_team_member: {
    label: 'Invite a team member',
    description: 'Invite your first colleague to collaborate.',
    order: 3,
  },
  choose_plan: {
    label: 'Choose a plan',
    description: 'Select a subscription plan that fits your needs.',
    order: 4,
  },
  add_payment_method: {
    label: 'Add a payment method',
    description: 'Add a payment method to activate your subscription.',
    order: 5,
  },
  upload_logo: {
    label: 'Upload your logo',
    description: 'Personalise your workspace with a company logo.',
    order: 6,
  },
};

/** All step keys sorted by display order. */
export const ORDERED_STEP_KEYS: OnboardingStepKeyType[] = (
  Object.entries(ONBOARDING_STEP_META) as [
    OnboardingStepKeyType,
    { order: number },
  ][]
)
  .sort(([, a], [, b]) => a.order - b.order)
  .map(([key]) => key);
