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
 * A/B/C(OA Service/File Artifacts/HPC Service)는 그 서비스가 게이트 2(canView/canEdit)를
 * 판정한다. D(External/Attested)만 물어볼 서비스가 없다(설계서 04장 §3).
 *
 * recipient(누가 볼 수 있는가)는 A/B/C/D 전부 공통으로 block 단위로 SIREN이 저장한다 —
 * artifact 단위로 SIREN이 editAccess/viewAccess를 직접 보관하던 옛 모델은 폐기했다.
 *
 * ★ v3 설계 도중 한 번 뒤집힌 결정이다 — 원래는 A만 여기 해당했다. 여러 workflow가 하나의
 *   artifact를 공유할 때 artifact 단위 권한이 workflow 경계를 넘어 꼬이는 문제와, HPC
 *   Service는 HPC망 안에서 권한 자체가 무의미하다는 점 때문에 B/C까지 넓혔다. 이름은
 *   그대로 유지한다 — A/B/C 전부 여전히 "그 서비스가 권한을 판정한다"는 뜻이기 때문이다.
 */
export function isServiceGovernedTier(tier: Tier): boolean {
  return tier !== 'D';
}

/** D 전용 — 물어볼 서비스가 없다(common/access.ts의 attestedLevel 참고). */
export function isSirenGovernedTier(tier: Tier): boolean {
  return !isServiceGovernedTier(tier);
}

export function isValidTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}
