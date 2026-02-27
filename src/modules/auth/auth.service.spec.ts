/**
 * AuthService — Unit Tests
 *
 * Pattern reference for testing NestJS services:
 *   - All external dependencies (Prisma, Redis, JWT, …) are replaced with Jest mocks.
 *   - Tests are fast (~ms), hermetic, and do NOT need a running database.
 *   - Each test resets mocks via `beforeEach` to prevent state leakage.
 *
 * Run:  npm test auth.service
 */

import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HASHED_PASSWORD = bcrypt.hashSync('Password1!', 1); // fast rounds for tests

interface UserShape {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MEMBER';
  companyId: string;
  isActive: boolean;
  emailVerified: boolean;
  deletedAt: null | Date;
  createdAt: Date;
  updatedAt: Date;
}

function makeUser(overrides: Partial<UserShape> = {}): UserShape {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    password: HASHED_PASSWORD,
    firstName: 'Alice',
    lastName: 'Smith',
    role: 'ADMIN' as const,
    companyId: 'company-1',
    isActive: true,
    emailVerified: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCompany(overrides = {}) {
  return {
    id: 'company-1',
    name: 'Acme Inc.',
    slug: 'acme-inc',
    logoUrl: null,
    stripeCustomerId: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Returns a fresh Prisma mock for each test. Each method is a jest.fn() that
 * returns undefined by default — override per-test with .mockResolvedValue().
 */
function buildPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    invitationToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    // $transaction handles both array-form and callback-form
    $transaction: jest.fn().mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        // Callback form — pass the same mock as the transaction client
        return (arg as (tx: unknown) => Promise<unknown>)(
          buildPrismaMock() as unknown,
        );
      }
      // Array form — resolve all promises in order
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
}

function buildCacheMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    ttl: jest.fn().mockResolvedValue(900),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cache: ReturnType<typeof buildCacheMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    cache = buildCacheMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('mock-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-secret') },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ─── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    const dto = {
      email: 'alice@example.com',
      password: 'Password1!',
      firstName: 'Alice',
      lastName: 'Smith',
      companyName: 'Acme Inc.',
    };

    it('creates a user + company and returns tokens without password', async () => {
      const company = makeCompany();
      const user = makeUser();

      prisma.user.findUnique.mockResolvedValue(null); // no duplicate
      prisma.company.findUnique.mockResolvedValue(null); // slug is free
      // Simulate the transaction callback creating company + user
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          const txPrisma = { ...prisma };
          txPrisma.company = {
            ...prisma.company,
            create: jest.fn().mockResolvedValue(company),
          };
          txPrisma.user = {
            ...prisma.user,
            create: jest.fn().mockResolvedValue(user),
          };
          return fn(txPrisma);
        },
      );
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await service.register(dto);

      expect(result.tokens.accessToken).toBe('mock-token');
      expect(result.tokens.refreshToken).toBe('mock-token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.company.slug).toBe('acme-inc');
    });

    it('throws ConflictException when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const dto = { email: 'alice@example.com', password: 'Password1!' };

    it('returns tokens on valid credentials', async () => {
      const company = makeCompany();
      prisma.user.findUnique.mockResolvedValue({ ...makeUser(), company });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result.tokens.accessToken).toBe('mock-token');
      expect(result.user.email).toBe('alice@example.com');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...makeUser(),
        company: makeCompany(),
      });

      await expect(
        service.login({ ...dto, password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account is locked', async () => {
      // Simulate an active lockout in Redis
      cache.get.mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      // Should NOT query the database at all when locked
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('locks the account after 5 consecutive failures', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      // Simulate counter reaching the lockout threshold on the 5th attempt
      cache.incr.mockResolvedValue(5);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);

      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining('login_locked:'),
        true,
        expect.any(Number),
      );
    });

    it('clears failed attempt counters on successful login', async () => {
      const company = makeCompany();
      prisma.user.findUnique.mockResolvedValue({ ...makeUser(), company });
      prisma.refreshToken.create.mockResolvedValue({});

      await service.login(dto);

      // del should be called to clear attemptsKey and lockKey
      expect(cache.del).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...makeUser({ isActive: false }),
        company: makeCompany(),
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for deleted company', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...makeUser(),
        company: makeCompany({ deletedAt: new Date() }),
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('updates the password and revokes refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.changePassword('user-1', {
        currentPassword: 'Password1!',
        newPassword: 'NewPassword1!',
      });

      expect(result.message).toMatch(/changed/i);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'WrongOldPass1!',
          newPassword: 'NewPassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── acceptInvite ───────────────────────────────────────────────────────────

  describe('acceptInvite()', () => {
    const dto = {
      token: 'valid-token-hex',
      firstName: 'Bob',
      lastName: 'Jones',
      password: 'Password1!',
    };

    it('creates the user and returns tokens when token is valid', async () => {
      const company = makeCompany();
      const newUser = makeUser({ id: 'user-2', email: 'bob@acme.com' });

      prisma.invitationToken.findUnique.mockResolvedValue({
        id: 'invite-1',
        token: dto.token,
        email: 'bob@acme.com',
        companyId: 'company-1',
        role: 'MEMBER',
        usedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
        company,
      });
      prisma.user.findUnique.mockResolvedValue(null); // email not yet taken

      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => {
          const txPrisma = { ...prisma };
          txPrisma.user = {
            ...prisma.user,
            create: jest.fn().mockResolvedValue(newUser),
          };
          txPrisma.invitationToken = {
            ...prisma.invitationToken,
            update: jest.fn().mockResolvedValue({}),
          };
          return fn(txPrisma);
        },
      );
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.acceptInvite(dto);

      expect(result.user.email).toBe('bob@acme.com');
      expect(result.tokens.accessToken).toBe('mock-token');
    });

    it('throws BadRequestException for expired invitation', async () => {
      prisma.invitationToken.findUnique.mockResolvedValue({
        id: 'invite-1',
        token: dto.token,
        email: 'bob@acme.com',
        companyId: 'company-1',
        role: 'MEMBER',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000), // already expired
        company: makeCompany(),
      });

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for already-used invitation', async () => {
      prisma.invitationToken.findUnique.mockResolvedValue({
        id: 'invite-1',
        token: dto.token,
        email: 'bob@acme.com',
        companyId: 'company-1',
        role: 'MEMBER',
        usedAt: new Date(), // already used
        expiresAt: new Date(Date.now() + 3_600_000),
        company: makeCompany(),
      });

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when email is already registered', async () => {
      prisma.invitationToken.findUnique.mockResolvedValue({
        id: 'invite-1',
        token: dto.token,
        email: 'bob@acme.com',
        companyId: 'company-1',
        role: 'MEMBER',
        usedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
        company: makeCompany(),
      });
      prisma.user.findUnique.mockResolvedValue(makeUser()); // already exists!

      await expect(service.acceptInvite(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('returns cached profile without hitting the database', async () => {
      const user = makeUser();
      const { password: _, ...userWithoutPassword } = user;
      cache.get.mockResolvedValue(userWithoutPassword);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(userWithoutPassword);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and populates the cache', async () => {
      const user = makeUser();
      cache.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user);

      await service.getProfile('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(cache.set).toHaveBeenCalled();
    });
  });
});
