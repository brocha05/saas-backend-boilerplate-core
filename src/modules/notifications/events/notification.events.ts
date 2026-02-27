// ─── Event Keys ─────────────────────────────────────────────────────────────

export const NotificationEvent = {
  USER_REGISTERED: 'user.registered',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  USER_INVITED: 'user.invited',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  INVOICE_PAID: 'subscription.invoice_paid',
  PAYMENT_FAILED: 'subscription.payment_failed',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
} as const;

export type NotificationEventKey =
  (typeof NotificationEvent)[keyof typeof NotificationEvent];

// ─── Event Payloads ──────────────────────────────────────────────────────────

export class UserRegisteredEvent {
  userId: string;
  email: string;
  firstName: string;
  companyId: string;
  companyName: string;
}

export class PasswordResetRequestedEvent {
  userId: string;
  email: string;
  firstName: string;
  /** Raw hex token — embed in reset link, never expose */
  resetToken: string;
}

export class PasswordResetCompletedEvent {
  userId: string;
  email: string;
  firstName: string;
}

export class UserInvitedEvent {
  /** Email of the person being invited */
  inviteeEmail: string;
  /** Name of the person being invited (if already registered) */
  inviteeName?: string;
  companyId: string;
  companyName: string;
  /** Full name of the person sending the invite */
  inviterName: string;
}

export class SubscriptionActivatedEvent {
  companyId: string;
  planName: string;
}

export class InvoicePaidEvent {
  companyId: string;
  /** Amount charged, in cents */
  amountPaid: number;
  currency: string;
  periodEnd: Date;
  invoicePdfUrl?: string;
}

export class PaymentFailedEvent {
  companyId: string;
  /** Amount due, in cents */
  amountDue: number;
  currency: string;
  nextRetryAt?: Date;
}

export class SubscriptionCanceledEvent {
  companyId: string;
  planName: string;
  /** Effective cancellation date */
  cancelAt: Date;
}
