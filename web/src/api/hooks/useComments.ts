import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { CommentDto } from '@/types/domain';

export function useComments(workflowId: string | undefined, blockId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.comments(workflowId ?? '', blockId ?? ''),
    enabled: Boolean(workflowId) && Boolean(blockId),
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
