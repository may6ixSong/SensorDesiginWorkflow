import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HldReleaseDto } from '@/types/domain';

export function useHldReleases(ipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.hldReleases(ipId ?? ''),
    enabled: Boolean(ipId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<HldReleaseDto[]>>(`/ips/${ipId}/hld-releases`);
      return res.data.data;
    },
  });
}

export function useCreateHldRelease(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string | undefined) => {
      const res = await apiClient.post<ApiEnvelope<HldReleaseDto>>(`/ips/${ipId}/hld-releases`, { note });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hldReleases(ipId) }),
  });
}
