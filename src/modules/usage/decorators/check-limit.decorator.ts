import { SetMetadata } from '@nestjs/common';

export const CHECK_LIMIT_KEY = 'checkLimit';

/**
 * Marks a handler so that UsageLimitGuard checks the company's plan limit
 * for the given metric before allowing the request through.
 * Returns 429 Too Many Requests when the limit is exceeded.
 *
 * @example
 * \@CheckLimit(UsageMetric.API_CALLS)
 * \@Get('data')
 * getData() { ... }
 */
export const CheckLimit = (metric: string) =>
  SetMetadata(CHECK_LIMIT_KEY, metric);
