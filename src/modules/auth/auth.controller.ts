import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import express from 'express';

import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  TwoFactorCodeDto,
} from './dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaTokenGuard } from './guards/mfa-token.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  /**
   * Register a new user + company.
   * Throttled to 10 requests per 10 minutes to prevent automated signups.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Register a new account and company' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticate with email + password.
   * Throttled to 10 attempts per minute to slow brute-force attacks.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in and receive JWT access + refresh tokens' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @ApiBody({ type: RefreshTokenDto })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a valid refresh token for a new token pair',
  })
  refresh(@CurrentUser() user: JwtPayload & { refreshToken: string }) {
    return this.authService.refreshTokens(user.sub, user.refreshToken);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(user.sub, dto.refreshToken);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return the current authenticated user payload' })
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  /**
   * Request a password reset email.
   * Very tight throttle — 5 requests per 15 minutes per IP — to prevent email flooding.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Complete a password reset using the token from email.
   * Throttled to prevent token enumeration.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Reset password using a token from the reset email',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── 2FA / MFA ─────────────────────────────────────────────────────────────

  /**
   * Returns whether the current user has 2FA enabled.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('2fa')
  @ApiOperation({ summary: 'Get 2FA status for the current user' })
  getTwoFactorStatus(@CurrentUser() user: JwtPayload) {
    return this.twoFactorService.getStatus(user.sub);
  }

  /**
   * Step 1 of 2FA enrollment: generates a TOTP secret and returns both the
   * base32 secret (for manual entry) and a QR code data URL.
   * The secret is saved but 2FA is NOT yet active — call POST /auth/2fa/verify-setup next.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Initiate 2FA setup — returns TOTP secret and QR code',
    description:
      'The user scans the QR code (or enters the secret manually) in their ' +
      'authenticator app, then confirms with POST /auth/2fa/verify-setup.',
  })
  setupTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.twoFactorService.generateSetup(user.sub);
  }

  /**
   * Step 2 of 2FA enrollment: verifies the first TOTP code from the authenticator
   * app, enables 2FA, and returns 10 single-use backup codes.
   * Backup codes are shown ONLY ONCE — the user must store them securely.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify-setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirm 2FA setup and receive backup codes',
    description:
      'Verifies the TOTP code from the authenticator app and activates 2FA. ' +
      'Returns 10 single-use backup codes — store them securely.',
  })
  verifyTwoFactorSetup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactorService.verifyAndEnable(user.sub, dto.code);
  }

  /**
   * Completes a 2FA-gated login.
   * The client must present the short-lived mfaToken (from POST /auth/login)
   * as the Bearer token, plus a TOTP code or backup code in the body.
   * On success returns a normal { user, company, tokens } response.
   */
  @Public()
  @UseGuards(MfaTokenGuard)
  @Post('2fa/challenge')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Complete 2FA login challenge',
    description:
      'Present the mfaToken from POST /auth/login as Bearer token, and provide ' +
      'a valid TOTP code or backup code in the body.',
  })
  async completeMfaChallenge(
    @Req() req: express.Request,
    @Body() dto: TwoFactorCodeDto,
  ) {
    const userId: string = (req as any).mfaUserId;
    const valid = await this.twoFactorService.verifyCode(userId, dto.code);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired 2FA code');
    }
    return this.authService.createSessionForUser(userId);
  }

  /**
   * Disables 2FA on the account.
   * Requires a valid TOTP code or backup code to confirm the user still
   * controls their authenticator app.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Delete('2fa')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Disable 2FA',
    description: 'Requires a current TOTP code or backup code to confirm.',
  })
  disableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactorService.disable(user.sub, dto.code);
  }

  /**
   * Generates a fresh set of 10 backup codes, invalidating all previous ones.
   * Requires a valid TOTP code (not a backup code) to confirm the user still
   * has access to their authenticator app.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('2fa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Regenerate backup codes',
    description:
      'Invalidates existing backup codes and issues 10 new ones. ' +
      'Requires a current TOTP code to confirm.',
  })
  regenerateBackupCodes(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.twoFactorService.regenerateBackupCodes(user.sub, dto.code);
  }
}
