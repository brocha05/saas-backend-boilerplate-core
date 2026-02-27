import {
  Controller,
  Get,
  Patch,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { OnboardingStatusDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Onboarding')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Returns the onboarding checklist for the current company, including
   * which steps are complete, overall progress (%), and whether setup is done.
   */
  @Get()
  @ApiOperation({
    summary: 'Get onboarding status',
    description:
      'Returns the full onboarding checklist for the authenticated company, ' +
      'including completion state for each step and overall progress.',
  })
  getStatus(@CurrentUser() user: JwtPayload): Promise<OnboardingStatusDto> {
    return this.onboardingService.getStatus(user.companyId);
  }

  /**
   * Manually marks an onboarding step as complete.
   * Use this for steps that cannot be auto-detected from domain events
   * (e.g. "verify_email", "complete_profile", "upload_logo").
   * Idempotent — calling it on an already-complete step is a no-op.
   */
  @Patch(':step')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({
    name: 'step',
    description:
      'Onboarding step key, e.g. verify_email | complete_profile | ' +
      'invite_team_member | choose_plan | add_payment_method | upload_logo',
  })
  @ApiOperation({
    summary: 'Mark an onboarding step as complete',
    description: 'Idempotent — safe to call multiple times for the same step.',
  })
  completeStep(
    @CurrentUser() user: JwtPayload,
    @Param('step') step: string,
  ): Promise<void> {
    return this.onboardingService.completeStep(user.companyId, step);
  }
}
