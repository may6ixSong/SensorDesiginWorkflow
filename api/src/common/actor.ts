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
 * ★ 이 헤더는 **항상 실제 호출자(realKnoxId)**의 Group이다 - 시뮬레이션 중에도 바뀌지
 *   않는다. "그 시뮬레이션을 켤 자격이 있는가"를 판정하는 값이기 때문이다. 지금 유효
 *   신원이 Admin인지는 이 값이 아니라 `ACTING_AS_GROUP_HEADER`로 따로 계산한다.
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
 * 시뮬레이션 대상 **본인**의 Group (calypso/src/common/actor.ts와 같은 축, 같은 이름).
 *
 * ★ 이 헤더가 없던 시절의 버그 - `USER_GROUP_HEADER` 하나로 "시뮬레이션을 켤 자격"과
 *   "지금 유효 신원이 Admin인가"를 겸하는 바람에, 권한 없는 사용자를 시뮬레이션해도
 *   실제 호출자가 Admin이라는 이유만으로 `Actor.isAdmin`이 true로 남았다. 그 결과
 *   `access.ts`의 "Admin은 전 계층 무조건 통과"가 그대로 먹어서 My Assignment의 모든
 *   release·artifact, 모든 workflow의 편집, Calypso artifact 전체 목록과 editor 권한
 *   지정까지 전부 열렸다(사용자 보고). Calypso는 이미 이 축을 따로 받고 있었는데
 *   SIREN api만 빠져 있었다.
 *
 * ★ 그래서 시뮬레이션 중 `Actor.isAdmin`은 **이 헤더**로 계산한다 - 대상 본인이 Admin일
 *   때만 true다. 대상이 non-admin이면 호출자가 Admin이어도 admin super 권한은 전부
 *   사라진다("그 사용자로 아예 새로 접속한 것처럼", 사용자 요청).
 */
export const ACTING_AS_GROUP_HEADER = 'x-acting-as-group';

const ADMIN_GROUP = 'Admin';

export interface Actor {
  /** 권한 계산에 쓰이는 유효 신원. 시뮬레이션 중이면 대상 사용자다. */
  knoxId: string;
  /** 실제 호출자. 감사 로그에는 항상 이 값이 남는다. */
  realKnoxId: string;
  isImpersonating: boolean;
  /**
   * **지금 유효 신원(knoxId) 기준**의 Admin 여부. 시뮬레이션 중이면 대상 본인이 Admin일
   * 때만 true다 - 그 사람으로 새로 접속했다면 가졌을 권한 그대로여야 하기 때문이다
   * (사용자 요청). 그래서 권한 판정은 어디서든 이 값 하나만 보면 되고, 호출부가
   * `isAdmin && !isImpersonating` 같은 보정을 따로 하지 않는다 - 그 보정은 예전에
   * 몇 군데만 손으로 발라 둔 미봉책이었고, 빠진 자리(access.ts·my-scope.service.ts 등)가
   * 곧 위 버그였다.
   */
  isAdmin: boolean;
  /**
   * **실제 호출자(realKnoxId) 기준**의 Admin 여부. 권한 판정에는 쓰지 않는다 - 시뮬레이터를
   * 켤 자격이 있는지, 감사 로그에 무엇을 남길지처럼 "호출자 자신"을 물어야 하는 자리에서만 쓴다.
   */
  callerIsAdmin: boolean;
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
  // 이건 항상 실제 호출자 기준이다 - 대상이 누구든 바뀌지 않는다.
  const callerIsAdmin = header(req, USER_GROUP_HEADER) === ADMIN_GROUP;

  const actingAs = header(req, ACTING_AS_HEADER);
  if (!actingAs || actingAs === realKnoxId) {
    return {
      knoxId: realKnoxId,
      realKnoxId,
      isImpersonating: false,
      isAdmin: callerIsAdmin,
      callerIsAdmin,
    };
  }

  // override는 검증된 실제 호출자가 Admin일 때만 반영한다 (§13.3 규칙 2) - 이 판정은
  // 반드시 callerIsAdmin(실제 호출자)으로 해야 한다.
  if (!callerIsAdmin) {
    throw new ForbiddenException('User simulation is available to Admin users only.');
  }

  // 유효 신원의 Admin 여부는 **대상 본인의 Group**으로 계산한다. 헤더가 없으면
  // non-admin으로 본다 - 시뮬레이션에서 권한이 새어나가는 쪽보다 덜 보이는 쪽이 안전하다.
  const targetIsAdmin = header(req, ACTING_AS_GROUP_HEADER) === ADMIN_GROUP;

  return {
    knoxId: actingAs,
    realKnoxId,
    isImpersonating: true,
    isAdmin: targetIsAdmin,
    callerIsAdmin,
  };
}

/**
 * Admin 전용 라우트에서 쓴다. 판정 기준은 **지금 유효 신원**이다 - 시뮬레이션 중에
 * non-admin을 대상으로 하고 있으면 실제 호출자가 Admin이어도 여기서 막힌다. 그게 맞다:
 * 시뮬레이터는 "그 사람이었다면"을 보여주는 기능이지, Admin 권한을 다른 사람 화면에
 * 겹쳐 보여주는 기능이 아니다. 관리 기능을 실제로 쓰려면 시뮬레이션을 먼저 꺼야 한다.
 */
export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) {
    throw new ForbiddenException('Admin only.');
  }
}
