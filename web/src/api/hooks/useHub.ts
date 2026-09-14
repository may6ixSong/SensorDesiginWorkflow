import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HubService } from '@/hooks/useHubServices';
import {
  ArtifactIntent,
  CandidateListDto,
  LiveServiceOptionDto,
  ProjectSearchCandidateDto,
} from '@/types/domain';

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

/**
 * 연동된 서비스에서 code+revision이 일치하는 project 후보를 찾는다(Hub 설계서 §19.3).
 * code+revision만으로는 유일하지 않을 수 있어(예: RPM) 후보를 화면에 그대로 보여주고
 * 사람이 직접 externalProjectId로 하나를 확정하게 한다 — SIREN은 자동으로 고르지 않는다.
 *
 * `enabled`는 호출부가 결정한다 — 이 서비스가 애초에 project search를 지원하지 않으면
 * (transport !== 'http' 이거나 baseUrl이 없으면) 호출 자체를 안 하는 게 맞다(§19.2 게이트).
 */
/**
 * "새 Artifact 추가" 다이얼로그의 Live Service 드롭다운(설계서 04장 §6.3) — 이 workflow의
 * project에 이미 연결된 A Tier 서비스만 후보다.
 */
export function useLiveServices(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.liveServices(workflowId ?? ''),
    enabled: Boolean(workflowId),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<LiveServiceOptionDto[]>(
        `/workflows/${workflowId}/artifact-sources/live-services`,
      );
      return res.data;
    },
  });
}

/**
 * Tier별 후보 목록 — pickable 판정까지 서버가 끝내서 내려준다(설계서 04장 §6). `enabled`는
 * 호출부가 결정한다(예: source가 아직 안 골라졌으면 호출하지 않는다).
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
    enabled: enabled && Boolean(workflowId) && Boolean(source) && (source !== 'live' || Boolean(serviceKey)),
    queryFn: async () => {
      const res = await apiClient.get<CandidateListDto>(
        `/workflows/${workflowId}/artifact-candidates`,
        { params: { source, intent, serviceKey } },
      );
      return res.data;
    },
  });
}

export function useProjectSearchCandidates(
  serviceKey: string, code: string, revision: string, enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.hubProjectSearch(serviceKey, code, revision),
    enabled: enabled && !!serviceKey && !!code,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<ProjectSearchCandidateDto[]>>(
        `/hub/services/${serviceKey}/projects/search`,
        { params: { code, revision } },
      );
      return res.data.data;
    },
  });
}
