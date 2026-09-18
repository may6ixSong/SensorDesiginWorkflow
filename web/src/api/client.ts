import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.SIREN_API || 'http://localhost:3000/api/v1',
});

/**
 * api/는 호출자를 X-Knox-Id 헤더만으로 식별한다 (토큰/세션 없음 — 인증은
 * 프론트엔드의 ADSSO(AuthProvider)에서 끝난다). AuthProvider가 사용자를 확정한
 * 직후 setApiKnoxId()를 호출해 이 값을 채운다.
 */
let currentKnoxId: string | null = null;

export const setApiKnoxId = (knoxId: string | null) => {
  currentKnoxId = knoxId;
};

/** calypsoClient.ts처럼 SIREN api 밖의 다른 api 클라이언트도 같은 신원을 실어야 할 때 쓴다. */
export const getApiKnoxId = () => currentKnoxId;

/**
 * ADSSO의 User.Group. api는 Admin 판정을 별도 목록이 아니라 이 값으로 한다
 * (Hub 설계서 §13.3 규칙 3). 토큰 전환 전까지의 임시 배선이며, 그 시점에 api는
 * 헤더 대신 검증된 토큰의 클레임을 읽는다 — 그때 이 헤더는 무시된다.
 */
let currentUserGroup: string | null = null;

export const setApiUserGroup = (group: string | null) => {
  currentUserGroup = group;
};

/** calypsoClient.ts처럼 다른 api 클라이언트가 Admin 신호를 같이 실어야 할 때 쓴다. */
export const getApiUserGroup = () => currentUserGroup;

/**
 * 사용자 시뮬레이터 (§13). Admin이 특정 사용자의 화면을 그대로 재현할 때만 채워진다.
 * api는 **검증된 실제 호출자가 Admin일 때만** 이 값을 반영한다 — FE에서 이 값을
 * 채운다고 권한이 생기지는 않는다.
 */
let currentActingAs: string | null = null;

export const setApiActingAs = (knoxId: string | null) => {
  currentActingAs = knoxId;
};

export const getApiActingAs = () => currentActingAs;

/**
 * 시뮬레이션 **대상 본인**의 User.Group. `X-User-Group`은 언제나 실제 로그인 사용자
 * (= 시뮬레이터를 켤 자격이 있는지 판정하는 값)라서, "지금 이 요청을 그 사람이 직접
 * 보냈다면 Admin이었을까"는 이 값으로 따로 보낸다.
 *
 * ★ 이 값을 안 보내던 시절엔 api가 `X-User-Group` 하나로 두 질문을 겸하는 바람에,
 *   권한 없는 사용자를 시뮬레이션해도 서버가 계속 Admin으로 판정했다 — My Assignment의
 *   모든 release·artifact, 모든 workflow의 편집 권한, Calypso artifact 전체 목록과
 *   editor 지정까지 전부 열려 보이던 버그(사용자 보고). Calypso는 같은 이름의 헤더를
 *   이미 받고 있었고, SIREN api도 이제 받는다.
 * ★ 안 보내면 api는 대상을 non-admin으로 본다 — 권한이 새는 쪽보다 덜 보이는 쪽이 안전하다.
 */
let currentActingAsGroup: string | null = null;

export const setApiActingAsGroup = (group: string | null) => {
  currentActingAsGroup = group;
};

export const getApiActingAsGroup = () => currentActingAsGroup;

apiClient.interceptors.request.use((config) => {
  if (currentKnoxId) {
    config.headers['X-Knox-Id'] = currentKnoxId;
  }
  if (currentUserGroup) {
    config.headers['X-User-Group'] = currentUserGroup;
  }
  if (currentActingAs) {
    config.headers['X-Acting-As'] = currentActingAs;
    // 대상 본인의 Group — 시뮬레이션 중일 때만 의미가 있다. 모르면 아예 안 보내고,
    // 그러면 api가 대상을 non-admin으로 본다(fail-closed).
    if (currentActingAsGroup) {
      config.headers['X-Acting-As-Group'] = currentActingAsGroup;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(error),
);

export interface ApiEnvelope<T> {
  data: T;
}
