/**
 * Built-in API key scope constants.
 *
 * Pass one or more of these when creating a key:
 *   POST /api-keys  { scopes: [ApiKeyScope.FILES_READ, ApiKeyScope.FILES_WRITE] }
 *
 * Enforce them on a route with @RequiresScope():
 *   @RequiresScope(ApiKeyScope.FILES_READ)
 *   @UseGuards(ApiKeyGuard)
 *   @Get('files')
 *
 * Add your own scopes as plain strings — the scope system is open.
 */
export const ApiKeyScope = {
  // ── Files ──────────────────────────────────────────────────────────────────
  FILES_READ: 'files:read',
  FILES_WRITE: 'files:write',

  // ── Users ──────────────────────────────────────────────────────────────────
  USERS_READ: 'users:read',

  // ── Notifications ──────────────────────────────────────────────────────────
  NOTIFICATIONS_READ: 'notifications:read',
} as const;

export type ApiKeyScopeValue = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];
