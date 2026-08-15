import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { DeliverableDto, EdgeDto, MemoDto } from '@/types/domain';
import { DraftDeliverable, DraftEdge, DraftMemo } from '@/store/canvasStore';

export interface PutCanvasPayload {
  deliverables: DraftDeliverable[];
  memos: DraftMemo[];
  edges: DraftEdge[];
}

export interface PutCanvasResult {
  deliverables: DeliverableDto[];
  memos: MemoDto[];
  edges: EdgeDto[];
}

/**
 * 드래그·Auto Fit·series 일정 변경은 모두 FE 메모리(draft)에서 완결되고,
 * 편집 세션 종료(저장) 시 최종 상태를 한 번에 PUT한다 (설계서 5.5, 7.1).
 */
export function usePutCanvas(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PutCanvasPayload) => {
      const res = await apiClient.put<ApiEnvelope<PutCanvasResult>>(`/ips/${ipId}/canvas`, payload);
      return res.data.data;
    },
    onSuccess: (result) => {
      qc.setQueryData(queryKeys.deliverables(ipId), result.deliverables);
      qc.setQueryData(queryKeys.memos(ipId), result.memos);
      qc.setQueryData(queryKeys.edges(ipId), result.edges);
    },
  });
}
