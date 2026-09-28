/**
 * Auto Run의 순수 판정 함수들(설계서 10장) — DB 없이 테스트할 수 있게 서비스에서 떼어 뒀다
 * (auto-run-policy.spec.ts).
 */

export interface FlowEdge {
  fromId: string;
  toId: string;
  bidirectional: boolean;
}

/**
 * 흐름 방향 인접 목록 — release의 source 계산(EdgesService.upstreamMap)과 같은 규칙이다.
 * 단방향은 from → to, 양방향은 두 방향 모두.
 */
export function successorsOf(edges: FlowEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (from: string, to: string) => {
    const list = map.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    map.set(from, list);
  };
  for (const e of edges) {
    push(e.fromId, e.toId);
    if (e.bidirectional) push(e.toId, e.fromId);
  }
  return map;
}

/** 이 node의 flow 직전 1홉 upstream — source artifact를 고르는 유일한 규칙이다(사용자 결정 A2). */
export function upstreamOf(nodeId: string, edges: FlowEdge[]): string[] {
  const out: string[] = [];
  const add = (id: string) => { if (id !== nodeId && !out.includes(id)) out.push(id); };
  for (const e of edges) {
    if (e.toId === nodeId) add(e.fromId);
    if (e.bidirectional && e.fromId === nodeId) add(e.toId);
  }
  return out;
}

/** 이 node를 source로 쓰는 flow 직후 1홉 downstream. */
export function downstreamOf(nodeId: string, edges: FlowEdge[]): string[] {
  const out: string[] = [];
  const add = (id: string) => { if (id !== nodeId && !out.includes(id)) out.push(id); };
  for (const e of edges) {
    if (e.fromId === nodeId) add(e.toId);
    if (e.bidirectional && e.toId === nodeId) add(e.fromId);
  }
  return out;
}

/**
 * 이 node가 flow 순환 위에 있는가(사용자 결정 B1·B2 — 판정 단위는 node, workflow 안에서만).
 * 양방향 edge는 그 자체로 두 node 사이의 순환이다.
 *
 * ★ workflow를 넘나드는 순환(WF1에서 X→Y, WF2에서 Y→X, 둘 다 Auto Run node)은 이 판정이
 *   잡지 못한다. 실행 중 연쇄 깊이(hop)를 세서 끊는 안전장치로 막을 수 있지만(예: 5 hop),
 *   그런 구성은 생기지 않는다는 사용자 판단(B3)에 따라 지금은 두지 않는다 — 필요해지면
 *   trigger payload에 depth를 싣고, version 이벤트의 triggerRunId로 이어받아 세면 된다.
 */
export function isOnCycle(nodeId: string, edges: FlowEdge[]): boolean {
  const succ = successorsOf(edges);
  const seen = new Set<string>();
  const stack = [...(succ.get(nodeId) ?? [])];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === nodeId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of succ.get(cur) ?? []) stack.push(next);
  }
  return false;
}

export interface SourceVersionState {
  /** 그 source의 가장 최신 published 버전 시각 — published 버전이 없으면 null. */
  latestPublishedAt: Date | null;
}

/**
 * 자동 발화 조건(사용자 결정 A3):
 *   - source가 1개 이상이고
 *   - 모든 source가 published 버전을 갖고 있으며
 *   - 모든 source의 최신 published 시각이 대상 artifact의 최신 버전(published 여부 무관)
 *     시각보다 뒤다. 대상에 버전이 아직 없으면 모든 source가 published이기만 하면 된다.
 */
export function shouldAutoFire(targetLatestAt: Date | null, sources: SourceVersionState[]): boolean {
  if (sources.length === 0) return false;
  for (const s of sources) {
    if (!s.latestPublishedAt) return false;
    if (targetLatestAt && s.latestPublishedAt.getTime() <= targetLatestAt.getTime()) return false;
  }
  return true;
}
