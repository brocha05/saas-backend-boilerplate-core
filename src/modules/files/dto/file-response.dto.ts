import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { File } from '@prisma/client';

export class FileResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  companyId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  uploadedById: string;

  @ApiProperty({ example: 'acme-corp/general/a1b2c3d4.pdf' })
  key: string;

  @ApiProperty({ example: 'my-saas-bucket' })
  bucket: string;

  @ApiProperty({ example: 'report-q4-2025.pdf' })
  originalName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', example: 204800 })
  size: number;

  @ApiPropertyOptional({ example: 'invoice', nullable: true })
  resourceType: string | null;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  resourceId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: File): FileResponseDto {
    const dto = new FileResponseDto();
    dto.id = entity.id;
    dto.companyId = entity.companyId;
    dto.uploadedById = entity.uploadedById;
    dto.key = entity.key;
    dto.bucket = entity.bucket;
    dto.originalName = entity.originalName;
    dto.mimeType = entity.mimeType;
    dto.size = entity.size;
    dto.resourceType = entity.resourceType;
    dto.resourceId = entity.resourceId;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
