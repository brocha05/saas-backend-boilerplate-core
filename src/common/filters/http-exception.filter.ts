import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import type { ErrorApiResponse } from '../interfaces/api-response.interface';

// Reverse map: 400 → "BAD_REQUEST", 404 → "NOT_FOUND", etc.
// HttpStatus is a bidirectional numeric enum — filter to named string keys, then flip.
const STATUS_CODE_MAP: Record<number, string> = Object.fromEntries(
  Object.entries(HttpStatus)
    .filter(([key]) => isNaN(Number(key)))
    .map(([name, code]) => [code as number, name]),
);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Reuse the requestId set by ResponseInterceptor when already present
    const existingId = res.getHeader('X-Request-ID') as string | undefined;
    const requestId = existingId ?? randomUUID();
    res.setHeader('X-Request-ID', requestId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exRes = exception.getResponse();

      if (typeof exRes === 'object' && exRes !== null) {
        const raw = (exRes as Record<string, unknown>).message;
        if (Array.isArray(raw)) {
          // ValidationPipe throws { message: string[], error: 'Bad Request' }
          details = raw as string[];
          message = 'Validation failed';
        } else if (typeof raw === 'string') {
          message = raw;
        } else {
          message = exception.message;
        }
      } else if (typeof exRes === 'string') {
        message = exRes;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      // Log internals but never expose stack traces to clients
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error('Unknown exception type thrown', String(exception));
    }

    const body: ErrorApiResponse = {
      success: false,
      error: {
        code: STATUS_CODE_MAP[status] ?? 'INTERNAL_SERVER_ERROR',
        message,
        ...(details !== undefined && { details }),
      },
      meta: { requestId },
    };

    res.status(status).json(body);
  }
}
