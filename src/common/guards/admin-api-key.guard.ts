import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-admin-api-key'];
    const expected = this.config.get<string>('app.adminApiKey');

    if (!expected || key !== expected) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }

    return true;
  }
}
