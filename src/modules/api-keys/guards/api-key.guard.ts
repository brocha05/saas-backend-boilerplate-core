import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';
import { REQUIRES_SCOPE_KEY } from '../decorators/requires-scope.decorator';
import type { ApiKeyContext } from '../../../common/interfaces';

/**
 * Guards routes that require API key authentication.
 *
 * Reads the key from (in order of precedence):
 *   1. X-API-Key header
 *   2. Authorization: ApiKey <key> header
 *
 * Use @RequiresScope() on the handler/class to enforce specific scopes.
 * Use @Public() on the route to bypass the global JwtAuthGuard first.
 *
 * @example
 * \@Public()
 * \@UseGuards(ApiKeyGuard)
 * \@RequiresScope('files:read')
 * \@Get('files')
 * listFiles(@CurrentApiKey() ctx: ApiKeyContext) { ... }
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { apiKey?: ApiKeyContext }>();

    const rawKey = this.extractKey(request);
    if (!rawKey) {
      throw new UnauthorizedException('API key required');
    }

    const keyContext = await this.apiKeysService.validateKey(rawKey);
    if (!keyContext) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // ── Scope enforcement ─────────────────────────────────────────────────────
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      REQUIRES_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes?.length) {
      const hasAll = requiredScopes.every((s) => keyContext.scopes.includes(s));
      if (!hasAll) {
        throw new ForbiddenException(
          `API key missing required scope(s): ${requiredScopes.join(', ')}`,
        );
      }
    }

    // Attach context so @CurrentApiKey() can extract it
    request.apiKey = keyContext;
    return true;
  }

  private extractKey(request: Request): string | null {
    // X-API-Key header (preferred)
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }

    // Authorization: ApiKey <key>
    const auth = request.headers['authorization'];
    if (auth?.startsWith('ApiKey ')) {
      return auth.slice(7);
    }

    return null;
  }
}
