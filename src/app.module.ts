import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { RedisModule } from '@nestjs-modules/ioredis';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Config
import {
  appConfig,
  jwtConfig,
  redisConfig,
  stripeConfig,
  s3Config,
  sesConfig,
} from './config';

// Infrastructure
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './infrastructure/logger/logger.module';

// Common
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { AuditMiddleware } from './common/middleware/audit.middleware';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { HealthModule } from './modules/health/health.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

@Module({
  imports: [
    // ─── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        jwtConfig,
        redisConfig,
        stripeConfig,
        s3Config,
        sesConfig,
      ],
      expandVariables: true,
    }),

    // ─── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('app.throttle.ttl') ?? 60000,
            limit: config.get<number>('app.throttle.limit') ?? 100,
          },
        ],
      }),
    }),

    // ─── Redis ───────────────────────────────────────────────────────────────
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
        options: {
          password: config.get<string>('redis.password') || undefined,
        },
      }),
    }),

    // ─── Core ─────────────────────────────────────────────────────────────────
    PrismaModule,
    LoggerModule,

    // ─── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CompaniesModule,
    SubscriptionsModule,
    HealthModule,
    FilesModule,
    NotificationsModule,
    AuditLogsModule,

    // ─── Event Bus ────────────────────────────────────────────────────────────
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      // Listeners run async — events don't block the emitting request
      global: true,
    }),
  ],
  providers: [
    // Global rate limiting
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global exception filter
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global logging interceptor
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuditMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
