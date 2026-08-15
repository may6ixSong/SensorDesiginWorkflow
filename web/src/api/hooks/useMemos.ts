import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { MemoDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';

/** Edit 권한자에게만 채워져서 온다(View는 빈 배열) - 설계서 6.3, 8.2-1. */
export function useMemos(ipId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.edit);
  return useQuery({
    queryKey: queryKeys.memos(ipId ?? ''),
    enabled: Boolean(ipId) && !isEditing,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<MemoDto[]>>(`/ips/${ipId}/memos`);
      return res.data.data;
    },
  });
}
