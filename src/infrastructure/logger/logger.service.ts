import {
  Injectable,
  LoggerService as NestLoggerService,
  Scope,
} from '@nestjs/common';

export interface LogContext {
  companyId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements NestLoggerService {
  private context?: string;

  setContext(context: string): void {
    this.context = context;
  }

  private formatMessage(message: string, context?: LogContext): string {
    const base = {
      timestamp: new Date().toISOString(),
      context: this.context,
      message,
    };
    return JSON.stringify({ ...base, ...context });
  }

  log(message: string, context?: LogContext): void {
    console.log(this.formatMessage(message, context));
  }

  error(message: string, trace?: string, context?: LogContext): void {
    console.error(
      JSON.stringify({
        ...JSON.parse(this.formatMessage(message, context)),
        trace,
        level: 'error',
      }),
    );
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage(message, context));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage(message, context));
    }
  }

  verbose(message: string, context?: LogContext): void {
    console.log(this.formatMessage(message, context));
  }
}
