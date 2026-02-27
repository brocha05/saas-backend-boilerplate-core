import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiKeyContext } from '../../../common/interfaces';

/**
 * Extracts the validated API key context from the request.
 * Only available on routes protected by @UseGuards(ApiKeyGuard).
 *
 * @example
 * \@UseGuards(ApiKeyGuard)
 * \@Get('data')
 * getData(@CurrentApiKey() key: ApiKeyContext) {
 *   return this.service.findByCompany(key.companyId);
 * }
 */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyContext => {
    const request = ctx.switchToHttp().getRequest<{ apiKey: ApiKeyContext }>();
    return request.apiKey;
  },
);
