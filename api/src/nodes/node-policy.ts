/**
 * node의 recipient 초기화 여부 판정 — **순수 함수만** 둔다(스펙 §4.3.1).
 *
 * ★ Nest/Mongoose를 import하지 않는다. 그래야 DB·모듈 그래프 없이 단위 테스트가 되고,
 *   jest worker가 이 파일 하나만 로드해서는 열린 핸들을 남기지 않는다
 *   (`api/src/releases/release-policy.ts`와 같은 이유, 같은 패턴).
 */

/**
 * artifact 매핑이 바뀔 때 recipients를 초기화해야 하는가.
 *
 * ★ `null → X`(=처음 매핑)는 초기화하지 않는다 — 초기화의 근거는 "이전 값이 새 산출물에도
 *   유효하다는 보장이 없다"인데, 이전 산출물이 아예 없었으면 그 위험이 존재하지 않는다.
 *   이 구분이 없으면 "Decide later"로 만들면서 지정한 recipient가 첫 매핑 때 조용히
 *   사라진다(스펙 §4.3.1). 데이터가 예외도 로그도 없이 사라지는 종류의 버그라 순수 함수로
 *   떼어내 테스트로 고정한다.
 */
export function shouldResetRecipients(before: string | null, after: string | null): boolean {
  return before !== null && before !== after;
}
