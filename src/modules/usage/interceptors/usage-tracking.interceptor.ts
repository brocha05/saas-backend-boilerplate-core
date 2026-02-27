import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import type { JwtPayload } from '../../../common/interfaces';
import type { ApiKeyContext } from '../../../common/interfaces';
import { UsageService } from '../usage.service';
import { TRACK_USAGE_KEY } from '../decorators/track-usage.decorator';

/**
 * Global interceptor — runs on every request.
 * When a handler is decorated with @TrackUsage(metric), this interceptor
 * increments the metric counter after a **successful** response only.
 * Exceptions (4xx/5xx) do not consume quota.
 *
 * Fire-and-forget: the increment is not awaited to avoid adding latency.
 */
@Injectable()
export class UsageTrackingInterceptor implements NestInterceptor {
  constructor(
    private readonly usageService: UsageService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metric = this.reflector.getAllAndOverride<string>(TRACK_USAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metric) return next.handle();

    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: JwtPayload; apiKey?: ApiKeyContext }
      >();

    const companyId = req.user?.companyId ?? req.apiKey?.companyId;

    return next.handle().pipe(
      tap(() => {
        if (!companyId) return;
        // Fire-and-forget — do not block the response
        this.usageService
          .increment(companyId, metric)
          .catch((err: Error) =>
            console.error(`Usage increment failed (${metric}):`, err.message),
          );
      }),
    );
  }
}
