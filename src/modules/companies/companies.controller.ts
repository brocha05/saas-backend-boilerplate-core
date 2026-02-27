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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto, InviteUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload, MulterFile } from '../../common/interfaces';

@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  getMyCompany(@CurrentUser() user: JwtPayload) {
    return this.companiesService.findWithSubscription(user.companyId);
  }

  @Get('me/members')
  getMembers(@CurrentUser() user: JwtPayload) {
    return this.companiesService.getMembers(user.companyId);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(user.companyId, dto);
  }

  @Post('me/invite')
  @Roles(UserRole.ADMIN)
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto) {
    return this.companiesService.inviteUser(user.companyId, dto, user.sub);
  }

  @Post('me/change-plan/:planId')
  @Roles(UserRole.ADMIN)
  changePlan(
    @CurrentUser() user: JwtPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.companiesService.changePlan(user.companyId, planId);
  }

  @Delete('me')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() user: JwtPayload) {
    return this.companiesService.delete(user.companyId);
  }

  @Post('me/logo')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/logos',
        filename: (_req, file, cb) =>
          cb(
            null,
            `${randomBytes(16).toString('hex')}${extname(file.originalname)}`,
          ),
      }),
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
