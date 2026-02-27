import { SetMetadata } from '@nestjs/common';

export const REQUIRES_SCOPE_KEY = 'apiKeyScopes';

/**
 * Declares the API key scopes required to access a route.
 * Must be used in combination with @UseGuards(ApiKeyGuard).
 *
 * @example
 * \@RequiresScope('files:read')
 * \@UseGuards(ApiKeyGuard)
 * \@Get('files')
 * listFiles(@CurrentApiKey() key: ApiKeyContext) { ... }
 */
export const RequiresScope = (...scopes: string[]) =>
  SetMetadata(REQUIRES_SCOPE_KEY, scopes);
