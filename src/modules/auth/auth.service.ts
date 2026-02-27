import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPayload } from '../../common/interfaces';
import { User, Company } from '@prisma/client';
import {
  NotificationEvent,
  UserRegisteredEvent,
  EmailVerificationRequestedEvent,
  PasswordResetRequestedEvent,
  PasswordResetCompletedEvent,
} from '../notifications/events/notification.events';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  company: Company;
  tokens: TokenPair;
}

const BCRYPT_SALT_ROUNDS = 12;

// Account lockout constants
const ATTEMPTS_PREFIX = 'login_attempts:';
const LOCKOUT_PREFIX = 'login_locked:';
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_TTL = 15 * 60; // 15 minutes in seconds

// Cache TTL constants
const USER_PROFILE_TTL = 300; // 5 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const slug = dto.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existingCompany = await this.prisma.company.findUnique({
      where: { slug },
    });
    const finalSlug = existingCompany ? `${slug}-${Date.now()}` : slug;

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const { company, user } = await this.prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: { name: dto.companyName, slug: finalSlug },
      });

      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'ADMIN',
          companyId: newCompany.id,
        },
      });

      return { company: newCompany, user: newUser };
    });

    const tokens = await this.generateTokenPair(user, company);

    this.logger.log(
      `New user registered: ${user.email} (company: ${company.slug})`,
    );

    const welcomeEvent = new UserRegisteredEvent();
    welcomeEvent.userId = user.id;
    welcomeEvent.email = user.email;
    welcomeEvent.firstName = user.firstName;
    welcomeEvent.companyId = company.id;
    welcomeEvent.companyName = company.name;
    this.eventEmitter.emit(NotificationEvent.USER_REGISTERED, welcomeEvent);

    // Send email verification
    const verificationToken = randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.prisma.emailVerificationToken.create({
      data: {
        token: verificationToken,
        userId: user.id,
        expiresAt: verificationExpiresAt,
      },
    });
    const verifyEvent = new EmailVerificationRequestedEvent();
    verifyEvent.userId = user.id;
    verifyEvent.email = user.email;
    verifyEvent.firstName = user.firstName;
    verifyEvent.verificationToken = verificationToken;
    this.eventEmitter.emit(
      NotificationEvent.EMAIL_VERIFICATION_REQUESTED,
      verifyEvent,
    );

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, company, tokens };
  }

  async confirmEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.cache.del(`user:${record.userId}`);

    return { message: 'Email verified successfully.' };
  }

  async resendConfirmation(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive || user.deletedAt) {
      throw new BadRequestException('User not found or inactive');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Invalidate existing pending tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.emailVerificationToken.create({
      data: { token, userId, expiresAt },
    });

    const event = new EmailVerificationRequestedEvent();
    event.userId = user.id;
    event.email = user.email;
    event.firstName = user.firstName;
    event.verificationToken = token;
    this.eventEmitter.emit(
      NotificationEvent.EMAIL_VERIFICATION_REQUESTED,
      event,
    );

    return { message: 'Verification email sent.' };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const attemptsKey = `${ATTEMPTS_PREFIX}${dto.email}`;
    const lockKey = `${LOCKOUT_PREFIX}${dto.email}`;

    // Check if account is locked
    const isLocked = await this.cache.get<boolean>(lockKey);
    if (isLocked) {
      const remainingTtl = await this.cache.ttl(lockKey);
      const minutes = Math.ceil(remainingTtl / 60);
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${minutes} minute(s).`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { company: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      // Record failed attempt
      const attempts = await this.cache.incr(attemptsKey);
      if (attempts === 1) {
        // Set expiry only on first attempt (reset window)
        await this.cache.expire(attemptsKey, LOCKOUT_TTL);
      }
      if (attempts >= LOCKOUT_THRESHOLD) {
        await this.cache.set(lockKey, true, LOCKOUT_TTL);
        await this.cache.del(attemptsKey);
        this.logger.warn(
          `Account locked after ${attempts} failed attempts: ${dto.email}`,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login — clear any failed attempt counters
    await this.cache.del(attemptsKey, lockKey);

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Account is inactive or deleted');
    }

    if (user.company.deletedAt) {
      throw new UnauthorizedException('Company is inactive');
    }

    const tokens = await this.generateTokenPair(user, user.company);
    const { password: _, company, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, company, tokens };
  }

  async getProfile(userId: string): Promise<Omit<User, 'password'>> {
    const cacheKey = `user:${userId}`;
    const cached = await this.cache.get<Omit<User, 'password'>>(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    const { password: _, ...userWithoutPassword } = user;
    await this.cache.set(cacheKey, userWithoutPassword, USER_PROFILE_TTL);
    return userWithoutPassword;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashed },
      }),
      // Revoke all refresh tokens to force re-login on other devices
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password changed successfully.' };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthResponse> {
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { token: dto.token },
      include: { company: true },
    });

    if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation token');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: invitation.role,
          companyId: invitation.companyId,
          emailVerified: true, // invite link validates email ownership
        },
      });

      await tx.invitationToken.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      });

      return newUser;
    });

    const tokens = await this.generateTokenPair(user, invitation.company);
    const { password: _, ...userWithoutPassword } = user;

    this.logger.log(
      `Invite accepted: ${user.email} joined company ${invitation.company.slug}`,
    );

    return { user: userWithoutPassword, company: invitation.company, tokens };
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<TokenPair> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { company: true } } },
    });

    if (!storedToken || storedToken.userId !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      // Detect token reuse — revoke all tokens for this user (rotation breach)
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Revoke current token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokenPair(storedToken.user, storedToken.user.company);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokenPair(
    user: User,
    company: Company,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: company.id,
      role: user.role,
    };

    const signPayload = payload as any;
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(signPayload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: (this.configService.get<string>('jwt.accessExpiresIn') ??
          '15m') as any,
      }),
      this.jwtService.signAsync(signPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: (this.configService.get<string>('jwt.refreshExpiresIn') ??
          '7d') as any,
      }),
    ]);

    // Persist refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return the same message to prevent email enumeration
    const message =
      'If that email address is registered, you will receive a password reset link.';

    if (!user || !user.isActive || user.deletedAt) {
      this.logger.log(
        `Password reset requested for unknown/inactive email: ${email}`,
      );
      return { message };
    }

    // Invalidate any existing unused tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const resetEvent = new PasswordResetRequestedEvent();
    resetEvent.userId = user.id;
    resetEvent.email = user.email;
    resetEvent.firstName = user.firstName;
    resetEvent.resetToken = token;
    this.eventEmitter.emit(
      NotificationEvent.PASSWORD_RESET_REQUESTED,
      resetEvent,
    );

    this.logger.log(`Password reset token created for ${email}`);

    return { message };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),

      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),

      // Revoke all refresh tokens to force re-login
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Clear cached profile
    await this.cache.del(`user:${resetToken.userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: resetToken.userId },
    });
    if (user) {
      const completedEvent = new PasswordResetCompletedEvent();
      completedEvent.userId = user.id;
      completedEvent.email = user.email;
      completedEvent.firstName = user.firstName;
      this.eventEmitter.emit(
        NotificationEvent.PASSWORD_RESET_COMPLETED,
        completedEvent,
      );
    }

    return { message: 'Password reset successfully.' };
  }
}
