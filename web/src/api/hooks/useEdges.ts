import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { EdgeDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';

export function useEdges(ipId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.isEditing);
  return useQuery({
    queryKey: queryKeys.edges(ipId ?? ''),
    enabled: Boolean(ipId) && !isEditing,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<EdgeDto[]>>(`/ips/${ipId}/edges`);
      return res.data.data;
    },
  });
}
