import Cookies from 'js-cookie';

/**
 * "이 release를 확인했다" 기록 — 서버가 아니라 브라우저 쿠키에만 남긴다(사용자 요청).
 * 확인의 기준은 하나뿐이다: release 상세 다이얼로그(`ReleaseDetailDialog`)가 열리면 그
 * 순간 그 release는 확인한 것으로 친다 — bell 팝업에서 열든 My Assignment의 Inbox/Outbox
 * 패널에서 열든 똑같다(그 다이얼로그 자신이 마킹하므로 호출부가 따로 챙기지 않는다).
 *
 * ★ **2주 정도만** 남긴다 — 그 뒤로는 쿠키가 스스로 사라지고 다시 "안 읽음"이 된다.
 *   unread 판정 자체가 최근 10일 release로만 한정되니(bell의 UNREAD_WINDOW_DAYS) 2주는
 *   그보다 넉넉한 버퍼다.
 * ★ 쿠키를 **지금 화면에 보이는 신원**(`clientId` — AuthProvider의 `user.KnoxID`, 시뮬레이션
 *   중이면 그 대상)으로 나눈다. 그래야 Admin이 사용자 시뮬레이터로 여러 사람을 오갈 때
 *   서로의 읽음 기록이 섞이지 않고, 각자 자기 자신의 unread 상태를 그대로 보여준다.
 */
const COOKIE_PREFIX = 'siren-release-read:';
const RETENTION_DAYS = 14;

/** 탭 안에서 배지·목록이 쿠키 재확인 없이 즉시 갱신되도록 쏘는 신호. */
export const RELEASE_READ_EVENT = 'siren:release-read';

function cookieName(clientId: string): string {
  return `${COOKIE_PREFIX}${clientId || 'anon'}`;
}

function readIds(clientId: string): Set<string> {
  const raw = Cookies.get(cookieName(clientId));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeIds(clientId: string, ids: Set<string>): void {
  // js-cookie가 숫자 expires를 내부적으로 어떤 "지금"(Date.now() vs new Date())으로
  // 계산하는지에 기대지 않고 직접 Date 객체를 만들어 넘긴다 — 계산 방식이 명시적이다.
  const expires = new Date();
  expires.setDate(expires.getDate() + RETENTION_DAYS);
  Cookies.set(cookieName(clientId), JSON.stringify(Array.from(ids)), { expires, sameSite: 'lax' });
}

export function getReadReleaseIds(clientId: string): Set<string> {
  return readIds(clientId);
}

export function isReleaseRead(clientId: string, releaseId: string): boolean {
  return readIds(clientId).has(releaseId);
}

export function markReleaseRead(clientId: string, releaseId: string): void {
  const ids = readIds(clientId);
  if (ids.has(releaseId)) return; // 이미 읽음 — 쓰기도 이벤트도 새로 낼 필요 없다.
  ids.add(releaseId);
  writeIds(clientId, ids);
  window.dispatchEvent(new CustomEvent(RELEASE_READ_EVENT, { detail: { clientId, releaseId } }));
}
