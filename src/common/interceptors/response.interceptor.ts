import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { SKIP_RESPONSE_WRAPPER_KEY } from '../decorators/skip-response-wrapper.decorator';
import type {
  SuccessApiResponse,
  PaginatedServiceResponse,
  ResponseMeta,
} from '../interfaces/api-response.interface';

// '__httpCode__' is the internal NestJS constant set by @HttpCode().
// Using the string literal avoids a subpath import that resolvePackageJsonExports may block.
const HTTP_CODE_METADATA_KEY = '__httpCode__';

function isPaginatedResponse(
  value: unknown,
): value is PaginatedServiceResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.data) &&
    typeof v.total === 'number' &&
    typeof v.page === 'number' &&
    typeof v.limit === 'number' &&
    typeof v.pages === 'number'
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessApiResponse<T> | void
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessApiResponse<T> | void> {
    // 1. @SkipResponseWrapper() — pass through untouched
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAPPER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return next.handle() as Observable<void>;

    // 2. 204 No Content — body must remain empty
    const httpCode = this.reflector.get<number>(
      HTTP_CODE_METADATA_KEY,
      context.getHandler(),
    );
    if (httpCode === HttpStatus.NO_CONTENT)
      return next.handle() as Observable<void>;

    // 3. RequestId: honour incoming trace header or generate a fresh UUID
    const req = context.switchToHttp().getRequest<Request>();
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();

    // 4. Echo requestId so the filter can reuse it if an exception is thrown downstream
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('X-Request-ID', requestId);

    // 5. Wrap the response
    return next.handle().pipe(
      map((data): SuccessApiResponse<T> => {
        const meta: ResponseMeta = { requestId };

        if (isPaginatedResponse(data)) {
          meta.pagination = {
            page: data.page,
            limit: data.limit,
            total: data.total,
            totalPages: data.pages,
          };
          return { success: true, data: data.data as unknown as T, meta };
        }

        return { success: true, data, meta };
      }),
    );
  }
}
