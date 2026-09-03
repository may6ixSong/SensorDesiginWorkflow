import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

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

/**
 * ADSSO의 User.Group. Admin 판정은 별도 목록을 두지 않고 이 값으로 한다
 * (Hub 설계서 §13.3 규칙 3).
 *
 * ★ 지금은 이 값이 헤더로 온다 - 즉 클라이언트가 주장하는 값이고 검증되지 않는다.
 *   토큰 전환(위 TODO) 전까지의 임시 배선이며, 그 시점에 이 한 줄이 "검증된 토큰의
 *   User.Group 클레임 읽기"로 바뀐다. 그 전까지 isAdmin은 신뢰할 수 있는 값이 아니다.
 */
export const USER_GROUP_HEADER = 'x-user-group';

/**
 * 사용자 시뮬레이터 (Hub 설계서 §13). Admin이 특정 사용자의 화면 상태를 그대로
 * 재현해 버그를 진단하기 위한 헤더. **검증된 실제 호출자가 Admin일 때만 반영된다** -
 * 이 검증이 빠지면 아무나 다른 사람 행세를 할 수 있고 §6.2·§7.2의 마스킹이 전부
 * 무력화된다. 읽기 전용이라는 사실은 방어가 되지 않는다 - 마스킹 규칙 자체가 읽기를
 * 막는 규칙이기 때문이다.
 */
export const ACTING_AS_HEADER = 'x-acting-as';

const ADMIN_GROUP = 'Admin';

export interface Actor {
  /** 권한 계산에 쓰이는 유효 신원. 시뮬레이션 중이면 대상 사용자다. */
  knoxId: string;
  /** 실제 호출자. 감사 로그에는 항상 이 값이 남는다. */
  realKnoxId: string;
  isImpersonating: boolean;
  /** realKnoxId 기준. 시뮬레이션 대상의 권한이 아니라 진짜 호출자의 권한이다. */
  isAdmin: boolean;
}

function header(req: { headers?: Record<string, unknown> }, name: string): string | null {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveActor(req: { headers?: Record<string, unknown> }): Actor {
  const realKnoxId = header(req, KNOX_ID_HEADER);
  if (!realKnoxId) {
    throw new UnauthorizedException(`${KNOX_ID_HEADER} header is required.`);
  }

  // 토큰 전환 시 이 줄이 "검증된 토큰의 User.Group 클레임"으로 바뀐다.
  const isAdmin = header(req, USER_GROUP_HEADER) === ADMIN_GROUP;

  const actingAs = header(req, ACTING_AS_HEADER);
  if (!actingAs || actingAs === realKnoxId) {
    return { knoxId: realKnoxId, realKnoxId, isImpersonating: false, isAdmin };
  }

  // override는 검증된 실제 호출자가 Admin일 때만 반영한다 (§13.3 규칙 2).
  if (!isAdmin) {
    throw new ForbiddenException('User simulation is available to Admin users only.');
  }

  return { knoxId: actingAs, realKnoxId, isImpersonating: true, isAdmin };
}

/** Admin 전용 라우트에서 쓴다. 판정 기준은 항상 realKnoxId다. */
export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) {
    throw new ForbiddenException('Admin only.');
  }
}
