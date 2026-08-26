import { UnauthorizedException } from '@nestjs/common';

/**
 * 사용자 인증은 web(ADSSO SSO)에서 끝난다. api는 요청 헤더의 KnoxID로만 호출자를
 * 식별하며, 자체 사용자 컬렉션을 두지 않는다 - 이름/부서/조직 정보는 사내 공통
 * 플랫폼 백엔드가 소유하고 web이 직접 조회한다. api가 저장하는 것은 과제·Workflow 단위의
 * 권한(누가 owner인지, 누가 view 권한을 받았는지)뿐이며 그 값은 모두 KnoxID 문자열이다.
 *
 * TODO: 토큰 전환 지점 - 추후 헤더 대신 IdP 토큰을 검증하도록 바꾼다.
 * 그때 resolveActor()만 교체하면 컨트롤러/가드는 그대로 둘 수 있다.
 */
export const KNOX_ID_HEADER = 'x-knox-id';

export interface Actor {
  knoxId: string;
}

export function resolveActor(req: { headers?: Record<string, unknown> }): Actor {
  const raw = req.headers?.[KNOX_ID_HEADER];
  const knoxId = Array.isArray(raw) ? raw[0] : raw;
  if (typeof knoxId !== 'string' || !knoxId.trim()) {
    throw new UnauthorizedException(`${KNOX_ID_HEADER} header is required.`);
  }
  return { knoxId: knoxId.trim() };
}
