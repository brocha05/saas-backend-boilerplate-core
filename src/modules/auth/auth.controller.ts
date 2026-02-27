import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ConfirmEmailDto,
} from './dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Register a new account and company' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

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

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

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

  @Public()
  @Post('confirm-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify email address using the token from the verification email',
  })
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.authService.confirmEmail(dto.token);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({ summary: 'Resend the email verification link' })
  resendConfirmation(@CurrentUser() user: JwtPayload) {
    return this.authService.resendConfirmation(user.sub);
  }
}
