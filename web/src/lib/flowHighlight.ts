import { EdgeDto } from '@/types/domain';

export interface FlowHighlightResult {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

function nextNeighbors(nodeId: string, edges: EdgeDto[]): { neighbor: string; edgeId: string }[] {
  const out: { neighbor: string; edgeId: string }[] = [];
  for (const e of edges) {
    if (e.fromId === nodeId) out.push({ neighbor: e.toId, edgeId: e._id });
    else if (e.bidirectional && e.toId === nodeId) out.push({ neighbor: e.fromId, edgeId: e._id });
  }
  return out;
}

function prevNeighbors(nodeId: string, edges: EdgeDto[]): { neighbor: string; edgeId: string }[] {
  const out: { neighbor: string; edgeId: string }[] = [];
  for (const e of edges) {
    if (e.toId === nodeId) out.push({ neighbor: e.fromId, edgeId: e._id });
    else if (e.bidirectional && e.fromId === nodeId) out.push({ neighbor: e.toId, edgeId: e._id });
  }
  return out;
}

/**
 * 조회 모드에서 블록 클릭 → flow 하이라이트 (설계서 3.9).
 * 클릭한 블록 기준으로 prev 방향은 prev만, next 방향은 next만 계속 타고 간다
 * (양방향을 섞어 훑지 않는다). 예: A→B→C에서 B 클릭 시 A는 prev만, C는 next만 추적.
 */
export function computeFlowHighlight(startId: string, edges: EdgeDto[]): FlowHighlightResult {
  const nodeIds = new Set<string>([startId]);
  const edgeIds = new Set<string>();

  const bfs = (getNeighbors: (id: string) => { neighbor: string; edgeId: string }[]) => {
    const queue = [startId];
    const seen = new Set([startId]);
    let qi = 0;
    while (qi < queue.length) {
      const current = queue[qi++];
      for (const { neighbor, edgeId } of getNeighbors(current)) {
        edgeIds.add(edgeId);
        nodeIds.add(neighbor);
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  };

  bfs((id) => prevNeighbors(id, edges));
  bfs((id) => nextNeighbors(id, edges));

  return { nodeIds, edgeIds };
}
