import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Notification } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  companyId: string;

  @ApiProperty({ example: 'subscription.activated' })
  type: string;

  @ApiProperty({ example: 'Subscription Activated' })
  title: string;

  @ApiProperty({ example: 'Your Pro plan is now active.' })
  body: string;

  @ApiPropertyOptional({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(entity: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.companyId = entity.companyId;
    dto.type = entity.type;
    dto.title = entity.title;
    dto.body = entity.body;
    dto.metadata = entity.metadata as Record<string, unknown> | null;
    dto.readAt = entity.readAt;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
