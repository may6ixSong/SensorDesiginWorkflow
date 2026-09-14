import { ReleaseDto } from '@/types/domain';

export interface ReleaseBadge {
  id: string;
  label: string;
}

/**
 * versionLabel → 이 block이 그 버전으로 **처음** 나갔던 release 하나(설계서 05장 §7.3).
 *
 * release는 매번 모든 artifact의 현재 published 스냅샷을 담으므로, 버전이 안 바뀐 채
 * 여러 release에 계속 실리면 이후 release에도 같은 versionLabel이 찍혀서 온다 — 하지만
 * 그건 "그 시점에 새로 감지된" 게 아니라 직전 release와 동일한 값이 반복된 것뿐이므로
 * 배지도 하나만, 처음 나간 release에만 붙인다(사용자 지적).
 *
 * ArtifactSlide의 산출물별 버전 목록과, B Tier(Calypso) 인라인 패널의 버전 트리가
 * 같은 규칙을 써야 해서 여기 한 곳으로 뽑았다.
 */
export function releaseBadgeMap(releases: ReleaseDto[], blockId: string): Map<string, ReleaseBadge> {
  const map = new Map<string, ReleaseBadge>();
  const sorted = [...releases].sort((a, b) => a.seq - b.seq);
  for (const r of sorted) {
    const item = r.items.find((i) => i.blockId === blockId);
    if (!item || item.masked || !item.published) continue;
    if (map.has(item.published.versionLabel)) continue;
    map.set(item.published.versionLabel, { id: r.id, label: r.label });
  }
  return map;
}
