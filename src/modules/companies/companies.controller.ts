import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Param,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto, InviteUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload, MulterFile } from '../../common/interfaces';

@ApiTags('Companies')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  @ApiOperation({
    summary: "Get the current user's company with active subscription",
  })
  getMyCompany(@CurrentUser() user: JwtPayload) {
    return this.companiesService.findWithSubscription(user.companyId);
  }

  @Get('me/members')
  @ApiOperation({ summary: 'List all members of the company' })
  getMembers(@CurrentUser() user: JwtPayload) {
    return this.companiesService.getMembers(user.companyId);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update company details (admin only)' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(user.companyId, dto);
  }

  @Post('me/invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite a user to join the company (admin only)' })
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto) {
    return this.companiesService.inviteUser(user.companyId, dto, user.sub);
  }

  @Post('me/change-plan/:planId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Upgrade or downgrade the active Stripe subscription (admin only)',
  })
  changePlan(
    @CurrentUser() user: JwtPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.companiesService.changePlan(user.companyId, planId);
  }

  @Delete('me')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete the company (admin only)' })
  delete(@CurrentUser() user: JwtPayload) {
    return this.companiesService.delete(user.companyId);
  }

  @Post('me/logo')
  @Roles(UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload company logo to S3 (admin only)' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  uploadLogo(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: MulterFile,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.companiesService.uploadLogo(user.companyId, file);
  }
}
