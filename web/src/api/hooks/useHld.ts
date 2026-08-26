import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HldReleaseDto } from '@/types/domain';

export function useHldReleases(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.hldReleases(workflowId ?? ''),
    enabled: Boolean(workflowId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<HldReleaseDto[]>>(`/workflows/${workflowId}/hld-releases`);
      return res.data.data;
    },
  });
}

export function useCreateHldRelease(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: string | undefined) => {
      const res = await apiClient.post<ApiEnvelope<HldReleaseDto>>(`/workflows/${workflowId}/hld-releases`, { note });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hldReleases(workflowId) }),
  });
}
