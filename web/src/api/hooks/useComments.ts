import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { CommentDto } from '@/types/domain';

/**
 * Comments는 이 workflow의 Edit Access가 있는 사람에게만 열린다(설계서 01장 §3.8 확장) —
 * `enabled`(기본 true)를 호출부가 명시적으로 그 판정(예: `own`/`canEdit`)에 걸어야 한다.
 * 안 걸면 view 권한자 화면에서도 이 쿼리가 나가 API가 403을 던진다.
 */
export function useComments(workflowId: string | undefined, blockId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.comments(workflowId ?? '', blockId ?? ''),
    enabled: Boolean(workflowId) && Boolean(blockId) && enabled,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<CommentDto[]>>(
        `/workflows/${workflowId}/blocks/${blockId}/comments`,
      );
      return res.data.data;
    },
  });
}

export function useCreateComment(workflowId: string, blockId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { text: string; versionId?: string; parentCommentId?: string }) => {
      const res = await apiClient.post<CommentDto>(`/workflows/${workflowId}/blocks/${blockId}/comments`, input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comments(workflowId, blockId) }),
  });
}
