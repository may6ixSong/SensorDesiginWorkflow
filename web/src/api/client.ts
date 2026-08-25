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

apiClient.interceptors.request.use((config) => {
  if (currentKnoxId) {
    config.headers['X-Knox-Id'] = currentKnoxId;
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
