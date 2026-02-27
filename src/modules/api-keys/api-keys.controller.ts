import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto, ApiKeyResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/interfaces';

@ApiTags('API Keys')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Create a new API key.
   * The full key is returned only in this response — store it securely.
   */
  @Post()
  @ApiOperation({
    summary: 'Create API key',
    description:
      'The full key is returned **once only**. Store it securely — it cannot be retrieved again.',
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.create(user.companyId, user.sub, dto);
  }

  /**
   * List all API keys for the current company.
   * The raw key is never returned here — only the prefix and metadata.
   */
  @Get()
  @ApiOperation({ summary: 'List API keys (masked)' })
  findAll(@CurrentUser() user: JwtPayload): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.findAll(user.companyId);
  }

  /**
   * Revoke an API key immediately.
   * Revoked keys are rejected by ApiKeyGuard on their next use.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.apiKeysService.revoke(id, user.companyId);
  }
}
