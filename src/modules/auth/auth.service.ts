import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../../common/interfaces';
import { User, Company } from '@prisma/client';
import {
  NotificationEvent,
  UserRegisteredEvent,
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
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

    const event = new UserRegisteredEvent();
    event.userId = user.id;
    event.email = user.email;
    event.firstName = user.firstName;
    event.companyId = company.id;
    event.companyName = company.name;
    this.eventEmitter.emit(NotificationEvent.USER_REGISTERED, event);

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, company, tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { company: true },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

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
        // expiresIn accepts ms-compatible strings ('15m', '7d', etc.)
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
