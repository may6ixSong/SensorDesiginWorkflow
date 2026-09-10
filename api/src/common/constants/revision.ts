/**
 * 과제 Revision 형식 (설계서 02장 §1).
 *
 * 지금은 접두어가 `EVT` 하나뿐이고 뒤에 0 이상의 정수가 붙는다 — `EVT0`, `EVT1`, …
 * 나중에 DVT/PVT가 필요해지면 REVISION_PREFIXES에 값을 추가하고 정규식이 그걸 그대로
 * 반영하도록 되어 있으므로 이 파일 한 곳만 고치면 된다.
 *
 * SOURCE OF TRUTH: docs/02-data-model.md §1
 * web/src/shared/constants/revision.ts 에도 동일하게 중복 정의한다 — 함께 수정할 것.
 */
export const REVISION_PREFIXES = ['EVT'] as const;

export type RevisionPrefix = (typeof REVISION_PREFIXES)[number];

/** `EVT0`, `EVT12` 는 통과. `EVT`, `EVT01`, `evt1`, `EVT-1` 은 불통과. */
export const REVISION_RE = new RegExp(`^(${REVISION_PREFIXES.join('|')})(0|[1-9][0-9]*)$`);

export function isValidRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION_RE.test(value);
}

/** 입력 정규화 — 공백 제거 + 대문자화. 형식 검증은 별도로 isValidRevision을 쓴다. */
export function normalizeRevision(value: string): string {
  return value.trim().toUpperCase();
}

export const REVISION_FORMAT_MESSAGE = `Revision must be one of ${REVISION_PREFIXES.join('/')} followed by a number (e.g. EVT0, EVT1).`;
