import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../interfaces';

/**
 * Extracts companyId from the JWT payload (already decoded by the auth guard)
 * and makes it available directly on the request object.
 * This runs AFTER the JwtAuthGuard has populated req.user.
 */
@Injectable()
export class CompanyMiddleware implements NestMiddleware {
  use(
    req: Request & { companyId?: string; user?: JwtPayload },
    _res: Response,
    next: NextFunction,
  ): void {
    if (req.user?.companyId) {
      req.companyId = req.user.companyId;
    }
    next();
  }
}
