import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface MfaTokenPayload {
  sub: string;
  type: 'mfa';
  iat?: number;
  exp?: number;
}

/**
 * Validates the short-lived MFA JWT issued by POST /auth/login when the user
 * has 2FA enabled. Specifically checks that the token's `type` claim is "mfa"
 * so it cannot be used as a regular access token (and vice-versa).
 *
 * On success, attaches the verified userId to `request.mfaUserId`.
 * Use alongside @Public() to bypass the global JwtAuthGuard.
 */
@Injectable()
export class MfaTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('MFA token required');
    }

    let payload: MfaTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<MfaTokenPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (payload.type !== 'mfa') {
      throw new UnauthorizedException('Token is not a valid MFA token');
    }

    // Attach the userId for use in the controller
    (request as any).mfaUserId = payload.sub;
    return true;
  }
}
