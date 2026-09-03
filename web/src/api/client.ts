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

/**
 * ADSSO의 User.Group. api는 Admin 판정을 별도 목록이 아니라 이 값으로 한다
 * (Hub 설계서 §13.3 규칙 3). 토큰 전환 전까지의 임시 배선이며, 그 시점에 api는
 * 헤더 대신 검증된 토큰의 클레임을 읽는다 — 그때 이 헤더는 무시된다.
 */
let currentUserGroup: string | null = null;

export const setApiUserGroup = (group: string | null) => {
  currentUserGroup = group;
};

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

apiClient.interceptors.request.use((config) => {
  if (currentKnoxId) {
    config.headers['X-Knox-Id'] = currentKnoxId;
  }
  if (currentUserGroup) {
    config.headers['X-User-Group'] = currentUserGroup;
  }
  if (currentActingAs) {
    config.headers['X-Acting-As'] = currentActingAs;
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
