export interface FlowEdgeLike {
  fromId: string;
  toId: string;
  bidirectional: boolean;
}

export interface FlowDepthResult {
  /** 1부터 시작하는 flow-depth (선행 산출물 depth의 최댓값 + 1). */
  depth: Map<string, number>;
  /** 위상 정렬로 해소되지 않은(순환에 관여하는) 노드 - 뒤로 밀린다 (§3.8-1). */
  cyclic: Set<string>;
}

/**
 * Kahn's algorithm 기반 위상 정렬로 flow-depth를 계산한다 (설계서 3.8).
 * bidirectional edge는 양방향 의존으로 취급하며, 그 결과 발생하는 순환은
 * 위상 정렬에서 해소되지 않고 "뒤로 밀리는" 노드로 남는다.
 */
export function computeFlowDepth(nodeIds: string[], edges: FlowEdgeLike[]): FlowDepthResult {
  const nodeSet = new Set(nodeIds);
  const outAdj = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    outAdj.set(id, []);
    indegree.set(id, 0);
  }

  const addEdge = (from: string, to: string) => {
    if (!nodeSet.has(from) || !nodeSet.has(to)) return;
    outAdj.get(from)!.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  };
  for (const e of edges) {
    addEdge(e.fromId, e.toId);
    if (e.bidirectional) addEdge(e.toId, e.fromId);
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if ((indegree.get(id) ?? 0) === 0) {
      queue.push(id);
      depth.set(id, 1);
    }
  }

  const visited = new Set<string>();
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    visited.add(id);
    for (const next of outAdj.get(id) ?? []) {
      const candidate = (depth.get(id) ?? 1) + 1;
      depth.set(next, Math.max(depth.get(next) ?? 0, candidate));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0 && !visited.has(next)) {
        queue.push(next);
      }
    }
  }

  const cyclic = new Set(nodeIds.filter((id) => !visited.has(id)));
  let maxDepth = Math.max(1, ...Array.from(depth.values(), (v) => v || 1));
  for (const id of cyclic) {
    maxDepth += 1;
    depth.set(id, maxDepth);
  }

  return { depth, cyclic };
}
