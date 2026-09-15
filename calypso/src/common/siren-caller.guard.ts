import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * "이 요청이 SIREN BE에서 온 게 맞는가"만 확인한다 — `X-Knox-Id` 등(actor.ts)은 신원
 * 주장일 뿐 검증되지 않는 값이라, 서비스 대 서비스 신뢰는 이 공유 비밀 하나로 세운다.
 * SIREN 쪽 `api/src/hub/calypso-client.service.ts`가 매 호출마다 `X-Siren-Token` 헤더로
 * 같은 값을 실어 보낸다.
 *
 * `sirenCallerToken`이 비어 있으면(로컬 개발 기본값) 검증을 건너뛴다 — 운영 배포에서는
 * 반드시 SIREN_CALLER_TOKEN을 설정할 것.
 */
@Injectable()
export class SirenCallerGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.config.get<string>('sirenCallerToken');
    if (!expected) return true;

    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers?.['x-siren-token'];
    if (provided !== expected) {
      throw new UnauthorizedException('Missing or invalid X-Siren-Token.');
    }
    return true;
  }
}
