import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../interfaces';

// ─── Path prefixes excluded from audit logging ─────────────────────────────
// Add controller path prefixes here when you annotate them with @SkipAudit().
// Middleware cannot read NestJS route metadata directly, so we rely on a
// prefix-based skip list maintained alongside the decorator.
const AUDIT_SKIP_PREFIXES = [
  '/api/v1/health',
  '/api/v1/audit-logs', // audit log reads must not generate more audit logs
  '/api/docs', // Swagger UI assets
  '/favicon.ico',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derives a semantic action string from the HTTP method and URL path.
 *
 * Path structure: /api/v1/{resource}/{resourceId?}/...
 *   - GET  + no ID  → {resource}.list
 *   - GET  + ID     → {resource}.read
 *   - POST          → {resource}.create
 *   - PUT | PATCH   → {resource}.update
 *   - DELETE        → {resource}.delete
 */
function deriveAction(method: string, segments: string[]): string {
  const resource = segments[3] ?? 'unknown';
  const hasId = !!segments[4];

  const verb =
    method === 'GET'
      ? hasId
        ? 'read'
        : 'list'
      : method === 'POST'
        ? 'create'
        : method === 'PUT' || method === 'PATCH'
          ? 'update'
          : method === 'DELETE'
            ? 'delete'
            : method.toLowerCase();

  return `${resource}.${verb}`;
}

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    res.on('finish', () => {
      // Skip non-business paths — no await because next() has already been called
      if (AUDIT_SKIP_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
        return;
      }

      const user = (req as Request & { user?: JwtPayload }).user;
      const companyId =
        user?.companyId ??
        (req as Request & { companyId?: string }).companyId ??
        null;

      // Path structure: '' / 'api' / 'v1' / resource / resourceId? / ...
      const segments = req.path.split('/');
      const resource = segments[3] ?? req.path;
      const potentialId = segments[4];
      const resourceId =
        potentialId && UUID_RE.test(potentialId) ? potentialId : null;

      this.prisma.auditLog
        .create({
          data: {
            companyId,
            userId: user?.sub ?? null,
            action: deriveAction(req.method, segments),
            resource,
            resourceId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
            metadata: {
              duration: Date.now() - startTime,
              query: req.query,
            },
          },
        })
        .catch((err: Error) =>
          this.logger.error('Audit log write failed', err.message),
        );
    });

    next();
  }
}
