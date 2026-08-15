import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IpDocument } from '../../ips/schemas/ip.schema';

/** IpAccessGuard가 req.ip_에 캐시해둔 IP 문서를 꺼낸다 (재조회 방지). */
export const CurrentIp = createParamDecorator((_: unknown, ctx: ExecutionContext): IpDocument => {
  const req = ctx.switchToHttp().getRequest();
  return req.ip_;
});
