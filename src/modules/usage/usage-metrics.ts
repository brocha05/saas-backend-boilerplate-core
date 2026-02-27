/**
 * Built-in usage metric constants.
 *
 * Rate metrics  — stored as incremental counters in the usage_meters table,
 *                 keyed by billing period (YYYY-MM). They reset automatically
 *                 when the calendar month rolls over.
 *
 * Gauge metrics — computed on demand from the users/files tables.
 *                 They always reflect the current state.
 *
 * Set limits in the Plan.limits JSON field:
 *   { "api_calls": 10000, "team_members": 5, "files_uploaded": 100, "storage_bytes": 1073741824 }
 * A missing key or null value means unlimited.
 */
export const UsageMetric = {
  // ── Rate metrics (tracked in usage_meters) ─────────────────────────────────
  API_CALLS: 'api_calls',
  FILES_UPLOADED: 'files_uploaded',

  // ── Gauge metrics (computed from DB) ───────────────────────────────────────
  TEAM_MEMBERS: 'team_members',
  STORAGE_BYTES: 'storage_bytes',
} as const;

export type UsageMetricValue = (typeof UsageMetric)[keyof typeof UsageMetric];

/** Metrics tracked as counters in usage_meters (reset monthly). */
export const RATE_METRICS = new Set<string>([
  UsageMetric.API_CALLS,
  UsageMetric.FILES_UPLOADED,
]);

/** Metrics computed directly from the DB — never stored in usage_meters. */
export const GAUGE_METRICS = new Set<string>([
  UsageMetric.TEAM_MEMBERS,
  UsageMetric.STORAGE_BYTES,
]);
