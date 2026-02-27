import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  DeleteAccountDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Self-service (/users/me) ──────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMyProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile (name only)' })
  updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.sub, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete own account (requires password confirmation)',
  })
  deleteMyAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteMyAccount(user.sub, dto);
  }

  // ─── Admin user management ─────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List all users in the company' })
  findAll(@CurrentUser() user: JwtPayload, @Query() pagination: PaginationDto) {
    return this.usersService.findAll(user.companyId, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.findById(id, user.companyId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a user in the company (admin only)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user.companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (admin can change role/status)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user (admin only)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.remove(id, user.companyId, user.sub);
  }

  @Post(':id/resend-invite')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend invitation email to a user (admin only)' })
  resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.resendInvite(id, user.companyId, user.sub);
  }
}
