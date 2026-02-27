import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({
    description:
      'Type of the resource this file belongs to (e.g. "user", "company", "invoice")',
    example: 'user',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @ApiPropertyOptional({
    description: 'UUID of the resource this file belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;
}
