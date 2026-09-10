/**
 * 통합 신뢰도 티어 (설계서 04장 §2). 산출물이 아니라 **버전 엔트리마다** 붙는다 —
 * 나중에 실연동이 붙어도 과거 수동 기록을 고치지 않고 다음 엔트리가 다른 tier로 찍힌다.
 *
 * SOURCE OF TRUTH: docs/04-artifact-and-publish.md §2
 * web/src/shared/constants/tier.ts 에도 동일하게 중복 정의한다 — 함께 수정할 것.
 */
export const TIERS = ['A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * A만 그 서비스가 권한을 판정하고, B/C/D는 SIREN이 artifact 단위로 권한을 보관한다
 * (설계서 04장 §3). 이 구분이 recipient의 저장 위치까지 결정하므로 헬퍼로 고정해 둔다.
 */
export function isServiceGovernedTier(tier: Tier): boolean {
  return tier === 'A';
}

/** B/C/D — SIREN이 editAccess/viewAccess를 직접 들고 있고, viewAccess가 곧 recipient다. */
export function isSirenGovernedTier(tier: Tier): boolean {
  return !isServiceGovernedTier(tier);
}

export function isValidTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}
