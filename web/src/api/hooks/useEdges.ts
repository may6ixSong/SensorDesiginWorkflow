import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { EdgeDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';

export function useEdges(workflowId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.edit);
  return useQuery({
    queryKey: queryKeys.edges(workflowId ?? ''),
    enabled: Boolean(workflowId) && !isEditing,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<EdgeDto[]>>(`/workflows/${workflowId}/edges`);
      return res.data.data;
    },
  });
}
