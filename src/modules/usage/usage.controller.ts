import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsageService } from './usage.service';
import { RATE_METRICS } from './usage-metrics';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Usage')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  /**
   * Returns the current billing period usage for all metrics along with plan limits.
   */
  @Get()
  @ApiOperation({
    summary: 'Get usage summary for the current billing period',
    description:
      'Shows rate metrics (api_calls, files_uploaded) and gauge metrics (team_members, storage_bytes) against plan limits.',
  })
  getUsage(@CurrentUser() user: JwtPayload) {
    return this.usageService.getUsageSummary(user.companyId);
  }

  /**
   * Resets all rate-metric counters for the current billing period.
   * Useful for testing or manual correction by an admin.
   */
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset all rate metric counters for the current period',
    description:
      'Zeroes api_calls and files_uploaded for the current billing period. ' +
      'Gauge metrics (team_members, storage_bytes) are not affected.',
  })
  resetAll(@CurrentUser() user: JwtPayload): Promise<void> {
    return this.usageService.resetCurrentPeriod(user.companyId);
  }

  /**
   * Resets a single rate metric counter for the current billing period.
   */
  @Post('reset/:metric')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a single rate metric counter' })
  @ApiParam({
    name: 'metric',
    enum: [...RATE_METRICS],
    description: 'The rate metric to reset',
  })
  resetMetric(
    @Param('metric') metric: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.usageService.resetMetric(user.companyId, metric);
  }
}
