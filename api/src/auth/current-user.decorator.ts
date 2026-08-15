import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../users/schemas/user.schema';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserDocument => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
