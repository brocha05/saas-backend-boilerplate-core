import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ─── Public ────────────────────────────────────────────────────────────────

  @Public()
  @Get('plans')
  @ApiOperation({
    summary: 'List all active pricing plans (public — no auth required)',
  })
  getPublicPlans() {
    return this.subscriptionsService.getPublicPlans();
  }

  // ─── Authenticated ─────────────────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get()
  getSubscription(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getSubscription(user.companyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('checkout')
  createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.createCheckoutSession(user.companyId, dto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.cancelSubscription(user.companyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('invoices')
  getInvoices(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getInvoices(user.companyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('portal')
  getBillingPortal(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getBillingPortalUrl(user.companyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resumeSubscription(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.resumeSubscription(user.companyId);
  }

  // ─── Stripe Webhook (public — no JWT) ─────────────────────────────────────
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error(
        'Raw body not available. Ensure rawBody is enabled in NestJS.',
      );
    }
    await this.subscriptionsService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
