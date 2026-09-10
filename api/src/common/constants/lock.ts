/**
 * 캔버스 편집 lock (설계서 03장 §3).
 *
 * ★ 이 lock의 범위는 **캔버스뿐**이다 — blocks/edges/memos/layout 저장에만 관여하고,
 *   workflow의 Name/Description/Department/Phase 수정은 lock과 무관하게 언제든 가능하다.
 *
 * SOURCE OF TRUTH: docs/03-canvas.md §3
 * web/src/shared/constants/lock.ts 에도 동일하게 중복 정의한다 — 함께 수정할 것.
 */

/** 점유 시간. 편집 중이면 하트비트로 계속 갱신된다. */
export const CANVAS_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * 클라이언트 하트비트 주기 — TTL의 1/5로 잡는다. 네트워크가 몇 번 연속 실패해도
 * 편집 중인 사람의 lock이 만료되지 않는다.
 */
export const CANVAS_LOCK_HEARTBEAT_MS = 2 * 60 * 1000;

export function lockExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + CANVAS_LOCK_TTL_MS);
}

export function isLockExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= now.getTime();
}
