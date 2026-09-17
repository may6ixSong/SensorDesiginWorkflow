import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HubService } from '@/hooks/useHubServices';
import { ArtifactIntent, CandidateListDto } from '@/types/domain';

/**
 * 산출물의 출처로 고를 수 있는 등록된 Hub 서비스 목록 (설계서 07장 §3).
 * "새 Artifact 추가" 다이얼로그가 이 목록에서 하나를 고르게 한다 — 기본은 켜져 있는
 * 서비스만 온다(includeDisabled 없이 호출).
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

/**
 * Tier별 후보 목록 — pickable 판정까지 서버가 끝내서 내려준다(설계서 04장 §6). `enabled`는
 * 호출부가 결정한다(예: source가 아직 안 골라졌으면 호출하지 않는다).
 *
 * ★ project 사전 링크 단계는 폐지됐다(07장 §7) — source='live'|'hpc'는 serviceKey만
 *   있으면 된다. code/revision은 그 workflow가 속한 project에서 서버가 그대로 채운다.
 */
export function useArtifactCandidates(
  workflowId: string | undefined,
  source: 'live' | 'file' | 'hpc' | undefined,
  intent: ArtifactIntent,
  serviceKey: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.artifactCandidates(workflowId ?? '', source ?? '', intent, serviceKey),
    enabled:
      enabled && Boolean(workflowId) && Boolean(source)
      && ((source !== 'live' && source !== 'hpc') || Boolean(serviceKey)),
    queryFn: async () => {
      const res = await apiClient.get<CandidateListDto>(
        `/workflows/${workflowId}/artifact-candidates`,
        { params: { source, intent, serviceKey } },
      );
      return res.data;
    },
  });
}
