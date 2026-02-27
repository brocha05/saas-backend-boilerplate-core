import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

/**
 * ApiKeysModule — programmatic API key management.
 *
 * Exports ApiKeyGuard so other modules can apply it to specific routes:
 *
 *   @Module({ imports: [ApiKeysModule] })
 *   export class MyModule {}
 *
 *   // In controller:
 *   @Public()
 *   @UseGuards(ApiKeyGuard)
 *   @RequiresScope(ApiKeyScope.FILES_READ)
 *   @Get('data')
 *   getData(@CurrentApiKey() key: ApiKeyContext) { ... }
 */
@Module({
  providers: [ApiKeysService, ApiKeyGuard],
  controllers: [ApiKeysController],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
