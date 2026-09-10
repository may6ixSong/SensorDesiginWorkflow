import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { BlockDto, EdgeDto, MemoDto } from '@/types/domain';

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PutCanvasPayload {
  blocks: { id: string; layout: Layout; phaseId: string }[];
  memos: { phaseId: string; text: string; layout: Layout }[];
  edges: { fromId: string; toId: string; bidirectional: boolean; auto: boolean }[];
  /** 레인 폭을 조절했을 때만 보낸다 — 생략하면 기존 저장값이 유지된다. */
  phaseWidths?: Record<string, number>;
}

export interface PutCanvasResult {
  blocks: BlockDto[];
  memos: MemoDto[];
  edges: EdgeDto[];
}

/**
 * 캔버스 일괄 저장. 드래그·레인 폭 변경은 모두 FE 메모리에서 계산되고, 저장할 때 최종
 * 상태를 한 번에 PUT한다.
 *
 * ★ 캔버스에는 **version 개념이 없다** — 항상 overwrite이고 스냅샷을 찍지 않는다
 *   (설계서 03장 §1).
 * ★ **이 요청만이 canvasLock을 요구한다.** lock이 만료됐거나 남이 들고 있으면 409가
 *   온다 — 호출부는 그걸 "편집 세션이 만료되었습니다"로 안내하고 편집 모드를 닫는다.
 *   workflow의 name/description/department/phase는 lock과 무관하게 저장된다.
 */
export function usePutCanvas(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PutCanvasPayload) => {
      const res = await apiClient.put<ApiEnvelope<PutCanvasResult>>(`/workflows/${workflowId}/canvas`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.memos(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.edges(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}
