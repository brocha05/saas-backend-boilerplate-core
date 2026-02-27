import {
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export class QueryAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource name (e.g. "users", "files")',
    example: 'users',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource?: string;

  @ApiPropertyOptional({
    description:
      'Filter by action prefix (e.g. "users.create", or just "users" to match all user actions)',
    example: 'users.create',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by HTTP method',
    enum: HTTP_METHODS,
    example: 'POST',
  })
  @IsOptional()
  @IsIn(HTTP_METHODS)
  method?: string;

  @ApiPropertyOptional({
    description: 'Filter by HTTP status code',
    example: 200,
    minimum: 100,
    maximum: 599,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @ApiPropertyOptional({
    description: 'Start of date range (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End of date range (ISO 8601)',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
