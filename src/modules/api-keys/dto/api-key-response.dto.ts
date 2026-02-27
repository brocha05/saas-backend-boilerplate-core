import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ApiKey } from '@prisma/client';

export class ApiKeyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;

  @ApiProperty({
    description: 'Masked key prefix — first ~12 characters of the key',
    example: 'sk_a1b2c3d4ef',
  })
  keyPrefix: string;

  @ApiPropertyOptional({
    description:
      'Full API key — ONLY returned on creation. Store it securely; it cannot be retrieved again.',
    example: 'sk_a1b2c3d4ef...',
  })
  key?: string;

  @ApiProperty({ type: [String], example: ['files:read'] })
  scopes: string[];

  @ApiPropertyOptional() expiresAt?: Date;
  @ApiPropertyOptional() lastUsedAt?: Date;
  @ApiPropertyOptional() revokedAt?: Date;
  @ApiProperty() createdAt: Date;

  static fromEntity(entity: ApiKey, rawKey?: string): ApiKeyResponseDto {
    const dto = new ApiKeyResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.keyPrefix = entity.keyPrefix;
    dto.scopes = entity.scopes;
    dto.expiresAt = entity.expiresAt ?? undefined;
    dto.lastUsedAt = entity.lastUsedAt ?? undefined;
    dto.revokedAt = entity.revokedAt ?? undefined;
    dto.createdAt = entity.createdAt;
    if (rawKey) dto.key = rawKey;
    return dto;
  }
}
