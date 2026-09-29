/**
 * 이 페이지를 iframe으로 띄워 메시지를 보낼 수 있는 부모(SIREN) origin. 여기 없는 origin의
 * 메시지는 무시하고, 답장도 확인된 origin으로만 보낸다('*' 금지).
 *
 * SDP_SPA에 옮길 때 운영 목록만 남기고, 개발 서버가 필요하면 환경별로 나눈다.
 */
export const ALLOWED_PARENT_ORIGINS = [
  'https://siren.samsungds.net', // SIREN prod
  'http://localhost:5173', // SIREN web dev (vite)
  'http://127.0.0.1:5173',
];
