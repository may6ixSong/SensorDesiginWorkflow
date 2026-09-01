import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { DeliverableDto, EdgeDto, Layout, MemoDto } from '@/types/domain';

export interface PutCanvasPayload {
  deliverables: { id: string; layout: Layout; phaseId: string }[];
  memos: { phaseId: string; text: string; layout: Layout }[];
  edges: { fromId: string; toId: string; bidirectional: boolean; auto: boolean }[];
  /** 이번 편집 세션에서 Phase 레인 폭을 조절했을 때만 보낸다 — 생략하면 기존 저장값이 유지된다. */
  phaseWidths?: Record<string, number>;
}

export interface PutCanvasResult {
  deliverables: DeliverableDto[];
  memos: MemoDto[];
  edges: EdgeDto[];
}

/**
 * 드래그·레인 폭 변경은 모두 FE 메모리에서 계산되고,
 * 편집 세션 종료 시 최종 상태를 한 번에 PUT한다 (설계서 5.5, 7.1).
 */
export function usePutCanvas(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PutCanvasPayload) => {
      const res = await apiClient.put<ApiEnvelope<PutCanvasResult>>(`/workflows/${workflowId}/canvas`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deliverables(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.memos(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.edges(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}
