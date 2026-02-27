import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { EmailPreferencesService } from './email-preferences.service';
import { EmailPreferenceDto, UpdateEmailPreferenceDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Email Preferences')
@Controller('email-preferences')
export class EmailPreferencesController {
  constructor(private readonly service: EmailPreferencesService) {}

  // ─── Authenticated endpoints ───────────────────────────────────────────────

  /**
   * Returns the current user's email notification preferences.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get email preferences' })
  getPreferences(@CurrentUser() user: JwtPayload): Promise<EmailPreferenceDto> {
    return this.service.getForUser(user.sub);
  }

  /**
   * Updates one or more email preference categories for the current user.
   * Omitted fields are left unchanged.
   */
  @Patch()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update email preferences',
    description:
      'Omit fields to leave them unchanged. Set to false to opt out of that category.',
  })
  updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEmailPreferenceDto,
  ): Promise<EmailPreferenceDto> {
    return this.service.updateForUser(user.sub, dto);
  }

  // ─── Token-based (unauthenticated) endpoints ───────────────────────────────
  // These are accessed from email footer links — no session required.

  /**
   * Returns the preferences identified by the unsubscribe token embedded
   * in email footers. Used by the frontend to render the preference centre
   * without requiring a login.
   */
  @Get('by-token/:token')
  @Public()
  @ApiParam({ name: 'token', description: 'Unsubscribe token from email footer' })
  @ApiOperation({
    summary: 'Get preferences by unsubscribe token (no auth)',
    description: 'Allows the frontend to render the preference centre from an email link.',
  })
  getByToken(@Param('token') token: string): Promise<EmailPreferenceDto> {
    return this.service.findByToken(token);
  }

  /**
   * Granularly updates preferences via token — lets users manage individual
   * categories from the preference centre without logging in.
   */
  @Patch('by-token/:token')
  @Public()
  @ApiParam({ name: 'token', description: 'Unsubscribe token from email footer' })
  @ApiOperation({
    summary: 'Update preferences by unsubscribe token (no auth)',
  })
  updateByToken(
    @Param('token') token: string,
    @Body() dto: UpdateEmailPreferenceDto,
  ): Promise<EmailPreferenceDto> {
    return this.service.updateByToken(token, dto);
  }

  /**
   * One-click unsubscribe — opts out of all optional email categories at once.
   * Complies with RFC 8058 (List-Unsubscribe-Post) and CAN-SPAM requirements.
   */
  @Post('unsubscribe-all/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'token', description: 'Unsubscribe token from email footer' })
  @ApiOperation({
    summary: 'One-click unsubscribe from all optional emails (no auth)',
    description:
      'Sets billing, productUpdates, and marketing to false in a single call. ' +
      'Transactional emails (security, password reset) are never affected.',
  })
  unsubscribeAll(@Param('token') token: string): Promise<EmailPreferenceDto> {
    return this.service.unsubscribeAll(token);
  }
}
