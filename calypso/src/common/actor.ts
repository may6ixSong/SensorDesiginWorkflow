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

/**
 * 시뮬레이션 대상 **본인**의 Group. `USER_GROUP_HEADER`는 항상 실제 호출자(그 시뮬레이션을
 * 켤 자격이 있는지 판정하는 값)라서, "지금 이 요청을 그 사람이 직접 보냈다면 Admin이었을까"는
 * 이 헤더로 따로 받는다 — 이 둘을 하나로 합쳐 버리면(예전엔 그랬다) 시뮬레이션 중에도
 * 실제 호출자가 Admin이라는 이유만으로 대상이 non-admin이어도 admin bypass가 새어나간다
 * (사용자 요청으로 발견·수정: Artifact 목록이 시뮬레이션 중에도 전부 보이던 버그).
 */
export const ACTING_AS_GROUP_HEADER = 'x-acting-as-group';

/**
 * 호출자가 **이 요청이 걸린 SIREN project 안에서** 속한 department 목록(project
 * membership 기준 — Hub 설계서 §11.4처럼 Calypso는 SIREN의 Project/members를 직접
 * 조회하지 않으므로, SIREN web이 자기가 이미 아는 값을 매 요청마다 실어 보낸다).
 * Artifact 권한 부여 시 "부서 단위 edit은 본인 소속 부서로만" 규칙을 서버에서
 * 검증하는 데 쓴다(§9.2 원칙의 연장) — 콤마로 여러 개.
 */
export const USER_DEPARTMENTS_HEADER = 'x-user-departments';

const ADMIN_GROUP = 'Admin';

export interface Actor {
  /** 권한 계산에 쓰이는 유효 신원. 시뮬레이션 중이면 대상 사용자다. */
  knoxId: string;
  /** 실제 호출자. 감사 로그에는 항상 이 값이 남는다. */
  realKnoxId: string;
  isImpersonating: boolean;
  /**
   * **지금 유효 신원(knoxId) 기준**의 Admin 여부 — 시뮬레이션 중이면 대상 본인이
   * Admin이어야 true다(그 사람이었다면 가졌을 권한 그대로, 사용자 요청). "시뮬레이션을
   * 켤 수 있는 자격"은 이 값이 아니라 realKnoxId(호출자)의 Group으로 따로 검증한다 —
   * resolveActor() 안에서만 그 구분이 나타나고, 여기 노출되는 isAdmin은 항상 유효 신원 것.
   */
  isAdmin: boolean;
  /** 지금 요청의 project 안에서 knoxId가 속한 department들. 모르면 빈 배열. */
  departments: string[];
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
  // 이건 항상 실제 호출자 기준이다 — 시뮬레이션을 켤 자격이 있는지 판정하는 값이라
  // 대상이 누구든 안 바뀐다.
  const callerIsAdmin = header(req, USER_GROUP_HEADER) === ADMIN_GROUP;
  const departments = (header(req, USER_DEPARTMENTS_HEADER) ?? '')
    .split(',').map((d) => d.trim()).filter(Boolean);

  const actingAs = header(req, ACTING_AS_HEADER);
  if (!actingAs || actingAs === realKnoxId) {
    return {
      knoxId: realKnoxId, realKnoxId, isImpersonating: false, isAdmin: callerIsAdmin, departments,
    };
  }

  // override는 검증된 실제 호출자가 Admin일 때만 반영한다 (§13.3 규칙 2) — 이 판정은
  // 반드시 callerIsAdmin(실제 호출자)으로 해야 한다. 노출되는 isAdmin은 그 대상 본인
  // 것으로 따로 계산한다.
  if (!callerIsAdmin) {
    throw new ForbiddenException('User simulation is available to Admin users only.');
  }
  const targetIsAdmin = header(req, ACTING_AS_GROUP_HEADER) === ADMIN_GROUP;

  return {
    knoxId: actingAs, realKnoxId, isImpersonating: true, isAdmin: targetIsAdmin, departments,
  };
}

/**
 * Admin 전용 라우트에서 쓴다. **지금 유효 신원 기준**이다 — 시뮬레이션 중에 non-admin을
 * 대상으로 하고 있으면 실제 호출자가 Admin이어도 여기서 막힌다. 그게 맞다: 시뮬레이션은
 * "그 사람이었다면"을 보여주는 기능이지, Admin 권한을 다른 사람 화면에 겹쳐 보여주는
 * 기능이 아니다(사용자 요청). 관리 기능을 실제로 쓰려면 시뮬레이션을 먼저 꺼야 한다.
 */
export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) {
    throw new ForbiddenException('Admin only.');
  }
}
