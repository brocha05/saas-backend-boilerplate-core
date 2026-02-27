/**
 * Email category taxonomy used to gate optional email sends against
 * the user's stored EmailPreference settings.
 *
 * TRANSACTIONAL emails are always delivered regardless of preferences:
 *   - Password reset requests / confirmations
 *   - Security alerts
 *   - Team invitations
 *
 * All other categories can be individually opted out.
 */
export const EmailCategory = {
  /** Always sent — never suppressed. */
  TRANSACTIONAL: 'transactional',
  /** Invoices, payment alerts, subscription changes. */
  BILLING: 'billing',
  /** Feature announcements, product updates, changelogs. */
  PRODUCT_UPDATES: 'productUpdates',
  /** Newsletters, promotions, re-engagement campaigns. */
  MARKETING: 'marketing',
} as const;

export type EmailCategoryType =
  (typeof EmailCategory)[keyof typeof EmailCategory];

/**
 * Maps a notification event key to its email category so
 * NotificationListeners can decide whether to send without a long switch.
 */
export const EVENT_CATEGORY_MAP: Record<string, EmailCategoryType> = {
  'user.registered': EmailCategory.PRODUCT_UPDATES,
  'subscription.activated': EmailCategory.BILLING,
  'subscription.invoice_paid': EmailCategory.BILLING,
  'subscription.payment_failed': EmailCategory.BILLING,
  'subscription.canceled': EmailCategory.BILLING,
  // Auth events are transactional — omitting them defaults to TRANSACTIONAL below
};

export function categoryForEvent(event: string): EmailCategoryType {
  return EVENT_CATEGORY_MAP[event] ?? EmailCategory.TRANSACTIONAL;
}
