import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Prevents the AuditMiddleware from recording a log entry for this route.
 *
 * Note: NestJS middleware runs before guards/interceptors and cannot read
 * route-level metadata directly. The middleware implements skip support via
 * a path-prefix list. Annotate a controller class with this decorator AND
 * ensure its prefix is included in AUDIT_SKIP_PREFIXES inside audit.middleware.ts.
 *
 * For individual handler skipping use the path-based approach in the middleware.
 *
 * @example
 * \@SkipAudit()            // Self-documenting intent
 * \@Controller('audit-logs')
 * export class AuditLogsController {}
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
