import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_WRAPPER_KEY = 'skipResponseWrapper';
export const SkipResponseWrapper = () =>
  SetMetadata(SKIP_RESPONSE_WRAPPER_KEY, true);
