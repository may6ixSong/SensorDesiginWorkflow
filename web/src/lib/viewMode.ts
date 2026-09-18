import Cookies from 'js-cookie';

/**
 * workflow 화면의 canvas/list 전환 — 마지막으로 본 view를 쿠키에 기억해 뒀다가 다음 접속 때
 * 그대로 보여준다(사용자 요청). 쿠키가 없는 최초 진입은 list다 — release history 기반의
 * list view가 이제 "메인" 화면이기 때문이다.
 */
export type ViewMode = 'canvas' | 'list';

const COOKIE_NAME = 'siren_workflow_view';

export function getViewMode(): ViewMode {
  return Cookies.get(COOKIE_NAME) === 'canvas' ? 'canvas' : 'list';
}

export function setViewMode(mode: ViewMode): void {
  Cookies.set(COOKIE_NAME, mode, { expires: 365 });
}
