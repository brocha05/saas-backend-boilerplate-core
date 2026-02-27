import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../common/interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret') as string,
    });
  }

  validate(payload: JwtPayload & { type?: string }): JwtPayload {
    // Reject MFA step-up tokens — they must only be used with MfaTokenGuard
    if (payload.type === 'mfa') {
      throw new UnauthorizedException(
        'MFA token cannot be used as an access token',
      );
    }
    if (!payload.sub || !payload.companyId) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
