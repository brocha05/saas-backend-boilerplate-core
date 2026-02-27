import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto, AuditLogResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import type { JwtPayload } from '../../common/interfaces';

/**
 * Audit log endpoints are excluded from audit logging themselves
 * (see AUDIT_SKIP_PREFIXES in audit.middleware.ts) to prevent recursive entries.
 */
@SkipAudit()
@ApiTags('Audit Logs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /**
   * Returns a paginated, filtered list of audit log entries for the current company.
   *
   * Scoped to the admin's own company — cross-company access is not possible.
   */
  @Get()
  @ApiOperation({
    summary: 'List audit log entries',
    description:
      'Paginated list with optional filters for user, resource, action, method, status code, and date range.',
  })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: QueryAuditLogsDto) {
    return this.auditLogsService.findAll(user.companyId, query);
  }

  /**
   * Returns a single audit log entry by ID (must belong to the admin's company).
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log entry' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AuditLogResponseDto> {
    return this.auditLogsService.findOne(id, user.companyId);
  }
}
