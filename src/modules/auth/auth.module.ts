import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { MfaTokenGuard } from './guards/mfa-token.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // secrets loaded per-call from ConfigService
  ],
  providers: [
    AuthService,
    TwoFactorService,
    MfaTokenGuard,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, TwoFactorService, MfaTokenGuard],
})
export class AuthModule {}
