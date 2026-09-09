import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Actor, resolveActor } from './actor';

/** X-Knox-Id 헤더에서 호출자를 세운다. 헤더가 없으면 401. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  return resolveActor(ctx.switchToHttp().getRequest());
});
