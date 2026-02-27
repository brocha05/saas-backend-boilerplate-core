import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';

import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── List ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "List the current user's notifications" })
  @ApiQuery({
    name: 'unread',
    required: false,
    type: Boolean,
    description: 'Filter to unread only',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() pagination: PaginationDto,
    @Query('unread', new DefaultValuePipe(false), ParseBoolPipe)
    onlyUnread: boolean,
  ) {
    return this.notificationsService.findAll(
      user.sub,
      user.companyId,
      pagination,
      onlyUnread,
    );
  }

  // ─── Unread count ────────────────────────────────────────────────────────

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the unread notification count' })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', properties: { count: { type: 'number' } } },
  })
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.notificationsService.getUnreadCount(
      user.sub,
      user.companyId,
    );
    return { count };
  }

  // ─── Mark one as read ────────────────────────────────────────────────────

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, type: NotificationResponseDto })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAsRead(id, user.sub, user.companyId);
  }

  // ─── Mark all as read ────────────────────────────────────────────────────

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 204 })
  markAllAsRead(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.notificationsService.markAllAsRead(user.sub, user.companyId);
  }
}
