import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Companies ─────────────────────────────────────────────────────────────

  @Get('companies')
  @ApiOperation({ summary: 'List all companies with active subscription' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCompanies(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getCompanies(page, limit);
  }

  @Get('companies/:id')
  @ApiOperation({ summary: 'Get company detail with users and subscriptions' })
  getCompany(@Param('id') id: string) {
    return this.adminService.getCompany(id);
  }

  @Patch('companies/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a company (soft-delete)' })
  deactivateCompany(@Param('id') id: string) {
    return this.adminService.deactivateCompany(id);
  }

  @Patch('companies/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate a previously deactivated company' })
  reactivateCompany(@Param('id') id: string) {
    return this.adminService.reactivateCompany(id);
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  @Get('subscriptions')
  @ApiOperation({ summary: 'List all subscriptions across all companies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getSubscriptions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getSubscriptions(page, limit);
  }
}
