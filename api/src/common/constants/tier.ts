/**
 * 통합 신뢰도 티어 (설계서 04장 §2). 산출물이 아니라 **버전 엔트리마다** 붙는다 —
 * 나중에 실연동이 붙어도 과거 수동 기록을 고치지 않고 다음 엔트리가 다른 tier로 찍힌다.
 *
 * ★ Tier D(External/Attested)는 폐기했다 — project 공유 Artifact로서의 존재 가치는
 *   있었지만(여러 workflow가 give/receive로 재사용), 실제 접근 통제·버전 이력을 가질
 *   근거가 없다는 점 때문에 결국 File Artifacts(B, Calypso)로 흡수했다. Calypso가
 *   File(실물 업로드, 여러 개 가능) 외에 OA-link/HPC-path 참조형 콘텐츠도 갖도록
 *   확장하는 것으로 D의 용도를 대체한다(설계서 04장 §2, §6).
 *
 * SOURCE OF TRUTH: docs/04-artifact-and-publish.md §2
 * web/src/types/domain.ts 의 `Tier` 타입에도 동일하게 중복 정의한다 — 함께 수정할 것.
 */
export const TIERS = ['A', 'B', 'C'] as const;
export type Tier = (typeof TIERS)[number];

// isServiceGovernedTier/isSirenGovernedTier(D 전용 분기 판정)는 D 폐기와 함께 제거했다 —
// A/B/C 전부 그 서비스가 게이트 2(canView/canEdit)를 판정하므로 더 이상 분기가 필요 없다
// (설계서 04장 §3). 아무 데서도 호출되지 않던 죽은 헬퍼였다.

export function isValidTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}
