import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HubService } from '@/hooks/useHubServices';

/**
 * 산출물의 출처로 고를 수 있는 등록된 Hub 서비스 목록 (Hub 설계서 §3.2).
 * AddDeliverableDialog/DeliverableDialog가 이제 Network/Format 대신 이 목록에서
 * 하나를 고르게 한다 — 기본은 켜져 있는 서비스만 온다(includeDisabled 없이 호출).
 */
export function useArtifactServices() {
  return useQuery({
    queryKey: queryKeys.hubServices,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<HubService[]>>('/hub/services');
      return res.data.data;
    },
  });
}
