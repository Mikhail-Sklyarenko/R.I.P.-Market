import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ExtensionAuthContext } from './extension-request-context';

export const CurrentExtensionAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ExtensionAuthContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ extensionAuth?: ExtensionAuthContext }>();
    if (!request.extensionAuth) {
      throw new Error('Extension auth context is missing');
    }
    return request.extensionAuth;
  },
);
