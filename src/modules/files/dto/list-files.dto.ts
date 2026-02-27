import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListFilesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by resource type',
    example: 'invoice',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter by resource ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;
}
