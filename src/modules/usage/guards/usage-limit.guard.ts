import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtPayload } from '../../../common/interfaces';
import type { ApiKeyContext } from '../../../common/interfaces';
import { UsageService } from '../usage.service';
import { CHECK_LIMIT_KEY } from '../decorators/check-limit.decorator';

/**
 * Global guard — runs on every request.
 * When a handler is decorated with @CheckLimit(metric), this guard verifies
 * that the company has not exceeded its plan limit for that metric.
 *
 * No-op when @CheckLimit is not present or when there is no authenticated
 * company context (anonymous / health endpoints).
 *
 * Runs AFTER JwtAuthGuard, so request.user is always populated for
 * authenticated routes.
 */
@Injectable()
export class UsageLimitGuard implements CanActivate {
  constructor(
    private readonly usageService: UsageService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metric = this.reflector.getAllAndOverride<string>(CHECK_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metric) return true;

    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: JwtPayload; apiKey?: ApiKeyContext }
      >();

    // Support both JWT user and API key authentication
    const companyId = req.user?.companyId ?? req.apiKey?.companyId;
    if (!companyId) return true; // No company context — public route, skip check

    const { allowed, current, limit } = await this.usageService.checkLimit(
      companyId,
      metric,
    );

    if (!allowed) {
      throw new HttpException(
        {
          message: `Plan limit reached for "${metric}": ${current} / ${limit ?? '∞'}`,
          metric,
          current,
          limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
