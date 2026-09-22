/**
 * Release 포함 항목 선택과 변경 감지 기준점 — **순수 함수만** 둔다(설계서
 * 05장 §2·§3, 스펙 2026-09-22-release-recipient-targeting-design.md).
 *
 * ★ preview와 실제 release가 **이 파일 하나만** 호출한다 — 규칙이 두 곳에 구현되면
 *   미리보기와 결과가 어긋난다(설계서 05장 §8).
 * ★ Mongoose를 import하지 않는다. 그래야 DB 없이 단위 테스트가 된다.
 */

export interface HasRecipients {
  recipients?: { departments?: string[] } | null;
}

const deptsOf = (n: HasRecipients): string[] => n.recipients?.departments ?? [];

/**
 * 타겟 부서로 포함 항목을 고른다(§2).
 *
 * - `target`이 비어 있으면 All — recipient 부서가 있는 후보 전체.
 * - recipient **부서**가 하나도 없는 후보는 어떤 경우에도 제외된다. `recipients.users`만
 *   있는 경우도 같다 — 부서 chip 체계에 설 자리가 없다(§2.1).
 * - 선택된 항목의 `recipients`는 **그대로 보존된다.** 타겟 아닌 부서가 겹치는 산출물만
 *   받게 되는 spillover가 여기서 파생된다(§2.2).
 */
export function selectReleasableNodes<T extends HasRecipients>(
  candidates: T[],
  target: string[],
): { selected: T[]; excludedNoRecipient: number } {
  const wanted = new Set(target);
  const selected: T[] = [];
  let excludedNoRecipient = 0;

  for (const candidate of candidates) {
    const departments = deptsOf(candidate);
    if (departments.length === 0) {
      excludedNoRecipient += 1;
      continue;
    }
    if (wanted.size === 0 || departments.some((d) => wanted.has(d))) {
      selected.push(candidate);
    }
  }

  return { selected, excludedNoRecipient };
}

/**
 * 이 release에 기록할 타겟 부서(§4.1). 항상
 * `targetDepartments ⊆ recipientDepartments` 가 되도록, **실제로 무언가를 받은 부서만**
 * 남긴다 — 아무것도 받지 않은 부서를 "타겟"으로 기록하는 것은 사실이 아니다.
 * All(빈 배열)이면 받은 부서 전체가 된다.
 */
export function resolveTargetDepartments(selected: HasRecipients[], target: string[]): string[] {
  const receiving = new Set<string>();
  selected.forEach((s) => deptsOf(s).forEach((d) => receiving.add(d)));
  if (target.length === 0) return [...receiving];
  return target.filter((d) => receiving.has(d));
}

/** 타겟이 아닌데 겹치는 산출물 때문에 받게 되는 부서(§2.2) — 다이얼로그의 overlap 탭용. */
export function spilloverDepartments(selected: HasRecipients[], target: string[]): string[] {
  if (target.length === 0) return [];
  const wanted = new Set(target);
  const out = new Set<string>();
  selected.forEach((s) => deptsOf(s).forEach((d) => { if (!wanted.has(d)) out.add(d); }));
  return [...out];
}

/**
 * 산출물별 변경 감지 기준점(§3) — "그 산출물이 담긴 직전 release의 item".
 *
 * ★ 부서와 무관하다. 산출물은 포함될 때마다 자기 recipient 부서 **전원**에게 나가므로
 *   전달 이력이 부서별로 갈리지 않는다.
 * ★ `releasesNewestFirst`는 **seq 내림차순**이어야 한다. 최신부터 훑어 각 artifactId의
 *   최초 등장만 채택하므로, 중간 release에 그 산출물이 빠져 있어도 올바르게 잡힌다.
 */
export function baselineByArtifact<I extends { artifactId: string }>(
  releasesNewestFirst: { items?: I[] }[],
): Map<string, I> {
  const out = new Map<string, I>();
  for (const release of releasesNewestFirst) {
    for (const item of release.items ?? []) {
      if (!out.has(item.artifactId)) out.set(item.artifactId, item);
    }
  }
  return out;
}
