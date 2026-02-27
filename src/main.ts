import { NestFactory, Reflector } from '@nestjs/core';
import {
  ValidationPipe,
  ClassSerializerInterceptor,
  Logger,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// Capture the raw request body so Stripe webhook signature verification works.
// NestJS's built-in `rawBody: true` does the same under the hood — we replicate
// it here to be able to set an explicit size limit on all JSON payloads.
function rawBodyBuffer(
  req: Request & { rawBody?: Buffer },
  _res: Response,
  buf: Buffer,
): void {
  if (buf?.length) req.rawBody = buf;
}

const BODY_LIMIT = '1mb';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // bodyParser: false — we register parsers manually below so we can set limits
  // and capture the raw body for Stripe webhook verification in one shot.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  // ─── Body parsers with size limits ────────────────────────────────────────
  app.use(json({ verify: rawBodyBuffer, limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Block any request whose Content-Length exceeds the limit before it is
  // even buffered (defence-in-depth for chunked-encoding edge cases).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const cl = parseInt(req.headers['content-length'] ?? '0', 10);
    if (cl > 1 * 1024 * 1024) {
      res.status(413).json({ message: 'Payload Too Large' });
      return;
    }
    next();
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [
    'http://localhost:3000',
  ];
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const reflector = app.get(Reflector);

  // ─── Security ─────────────────────────────────────────────────────────────
  // Disable CSP in non-production so Swagger UI (inline scripts/styles) works
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
    }),
  );

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Company-Id',
      'X-Request-ID', // Allow clients to pass a trace ID for distributed tracing
      'X-API-Key', // API key authentication header
    ],
    exposedHeaders: ['X-Request-ID'], // Allow clients to read the echoed request ID
  });

  // ─── API Prefix & Versioning ───────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ─── Global Validation ────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties (mass assignment protection)
      forbidNonWhitelisted: true,
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Global Interceptors (ORDER MATTERS) ──────────────────────────────────
  // ResponseInterceptor (index 0) is OUTER — its map() runs last on the response path.
  // ClassSerializerInterceptor (index 1) is INNER — its map() runs first, stripping
  // @Exclude() fields from DTOs before ResponseInterceptor wraps them in the envelope.
  app.useGlobalInterceptors(
    new ResponseInterceptor(reflector),
    new ClassSerializerInterceptor(reflector),
  );

  // ─── Global JWT Guard (public endpoints use @Public() decorator) ───────────
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // ─── Swagger (non-production only) ────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Boilerplate Backend API')
      .setDescription('SaaS B2B multi-company REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ─── Shutdown Hooks ───────────────────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`🚀 Application running on: http://localhost:${port}/api/v1`);
  logger.log(`📊 Health check: http://localhost:${port}/api/v1/health`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  if (nodeEnv !== 'production') {
    logger.log(`📖 Swagger UI: http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err: Error) => {
  new Logger('Bootstrap').error('Failed to start application', err.stack);
  process.exit(1);
});
