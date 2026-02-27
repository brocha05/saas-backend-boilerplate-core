import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuditLog } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() companyId?: string;
  @ApiPropertyOptional() userId?: string;

  @ApiProperty({ description: 'Semantic action, e.g. "users.create"' })
  action: string;

  @ApiProperty({ description: 'Resource type, e.g. "users"' })
  resource: string;

  @ApiPropertyOptional() resourceId?: string;

  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ example: '/api/v1/users' }) path: string;
  @ApiPropertyOptional({ example: 201 }) statusCode?: number;
  @ApiPropertyOptional() ipAddress?: string;
  @ApiPropertyOptional() userAgent?: string;

  @ApiPropertyOptional({
    description: 'Extra context: duration in ms, query params, etc.',
    example: { duration: 45, query: {} },
  })
  metadata?: Record<string, unknown>;

  @ApiProperty() createdAt: Date;

  static fromEntity(entity: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = entity.id;
    dto.companyId = entity.companyId ?? undefined;
    dto.userId = entity.userId ?? undefined;
    dto.action = entity.action;
    dto.resource = entity.resource;
    dto.resourceId = entity.resourceId ?? undefined;
    dto.method = entity.method;
    dto.path = entity.path;
    dto.statusCode = entity.statusCode ?? undefined;
    dto.ipAddress = entity.ipAddress ?? undefined;
    dto.userAgent = entity.userAgent ?? undefined;
    dto.metadata = (entity.metadata as Prisma.JsonObject | null) ?? undefined;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
