import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import type { PaginationDto } from '../../common/dto/pagination.dto';

export interface PaginatedNotifications {
  data: NotificationResponseDto[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CreateNotificationInput {
  userId: string;
  companyId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Create (used internally by listeners) ───────────────────────────────

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });

    this.logger.debug(
      `In-app notification created: userId=${input.userId} type=${input.type}`,
    );

    return notification;
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  async findAll(
    userId: string,
    companyId: string,
    pagination: PaginationDto,
    onlyUnread?: boolean,
  ): Promise<PaginatedNotifications> {
    const { page = 1, limit = 20, skip } = pagination;

    const where = {
      userId,
      companyId,
      ...(onlyUnread && { readAt: null }),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications.map(NotificationResponseDto.fromEntity),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: string, companyId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, companyId, readAt: null },
    });
  }

  // ─── Mark as read ─────────────────────────────────────────────────────────

  async markAsRead(
    id: string,
    userId: string,
    companyId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, companyId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    if (notification.readAt)
      return NotificationResponseDto.fromEntity(notification);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NotificationResponseDto.fromEntity(updated);
  }

  async markAllAsRead(userId: string, companyId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, companyId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
