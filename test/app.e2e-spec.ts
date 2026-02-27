/**
 * E2E Test Suite
 *
 * Tests the full HTTP stack (routing, guards, validation, response format).
 * Requires a running PostgreSQL and Redis instance.
 *
 * Fastest way to start the required services:
 *   docker-compose up -d postgres redis
 *
 * Then run:
 *   npm run test:e2e
 *
 * Environment: reads from .env (or .env.test if present).
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

// ─── Shared state populated during the test run ───────────────────────────────
let accessToken: string;
let registeredEmail: string;

// ─── App bootstrap ────────────────────────────────────────────────────────────

describe('Boilerplate E2E', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror main.ts setup so guards and interceptors behave identically
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    const reflector = app.get(Reflector);
    app.useGlobalInterceptors(
      new ResponseInterceptor(reflector),
      new ClassSerializerInterceptor(reflector),
    );
    app.useGlobalGuards(new JwtAuthGuard(reflector));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Health ─────────────────────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('returns a health object', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.status).toBeLessThan(503);
      expect(res.body).toHaveProperty('status');
    });
  });

  // ─── Plans (public) ─────────────────────────────────────────────────────────

  describe('GET /api/v1/subscriptions/plans', () => {
    it('returns the list of plans without authentication', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/subscriptions/plans',
      );
      expect(res.status).toBe(200);
      // Response is wrapped in { data: [...] }
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Auth — Validation ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register — validation', () => {
    it('rejects missing fields', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400));

    it('rejects weak password', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Corp',
        })
        .expect(400));

    it('rejects invalid email format', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'Password1!',
          firstName: 'John',
          lastName: 'Doe',
          companyName: 'Test Corp',
        })
        .expect(400));
  });

  // ─── Auth — Full flow ───────────────────────────────────────────────────────

  describe('Full auth flow', () => {
    const timestamp = Date.now();
    registeredEmail = `e2e-${timestamp}@example.com`;
    const password = 'E2eTest1!';

    it('registers a new user and returns tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: registeredEmail,
          password,
          firstName: 'E2E',
          lastName: 'User',
          companyName: `E2E Corp ${timestamp}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('tokens');
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('rejects duplicate email registration', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: registeredEmail,
          password,
          firstName: 'Duplicate',
          lastName: 'User',
          companyName: 'Dup Corp',
        })
        .expect(409));

    it('logs in and stores the access token for subsequent tests', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: registeredEmail, password });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeTruthy();

      accessToken = res.body.data.tokens.accessToken;
    });

    it('rejects wrong password', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: registeredEmail, password: 'WrongPass1!' })
        .expect(401));

    it('rejects unknown email', () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPass1!' })
        .expect(401));
  });

  // ─── Auth — Authenticated endpoints ─────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns full user profile when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('email', registeredEmail);
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('returns 401 without token', () =>
      request(app.getHttpServer()).get('/api/v1/auth/me').expect(401));
  });

  // ─── Users ──────────────────────────────────────────────────────────────────

  describe('GET /api/v1/users/me', () => {
    it('returns own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('email', registeredEmail);
    });
  });

  describe('GET /api/v1/users', () => {
    it('returns 401 without token', () =>
      request(app.getHttpServer()).get('/api/v1/users').expect(401));

    it('returns user list when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('data');
      expect(Array.isArray(res.body.data.data)).toBe(true);
    });
  });

  // ─── Companies ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/companies/me', () => {
    it('returns company with subscription', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/companies/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name');
    });
  });
});
