import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * E2E Test Suite — Auth & Health
 *
 * Prerequisites:
 *   - Running PostgreSQL and Redis (use docker-compose for test env)
 *   - Set TEST_DATABASE_URL and TEST_REDIS_URL env vars, or use .env.test
 *
 * Run with: npm run test:e2e
 */
describe('Auth & Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Health Check ─────────────────────────────────────────────────────────
  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect((res) => {
          expect(res.status).toBeLessThan(503);
          expect(res.body).toHaveProperty('status');
        });
    });
  });

  // ─── Auth Registration ─────────────────────────────────────────────────────
  describe('POST /api/v1/auth/register', () => {
    it('should reject weak passwords', async () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Corp',
        })
        .expect(400);
    });

    it('should reject invalid email', async () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'Password1!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: 'Test Corp',
        })
        .expect(400);
    });

    it('should register a new user successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `e2e-${Date.now()}@example.com`,
          password: 'Password1!',
          firstName: 'John',
          lastName: 'Doe',
          organizationName: `E2E Corp ${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('tokens');
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
      expect(res.body.data.user).not.toHaveProperty('password');
    });
  });

  // ─── Auth Login ───────────────────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    it('should reject invalid credentials', async () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPass1!' })
        .expect(401);
    });
  });

  // ─── Protected Route ──────────────────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('should return 401 without token', async () => {
      return request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });
  });
});
