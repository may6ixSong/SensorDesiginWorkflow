import { useQueries, useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { HubService } from '@/hooks/useHubServices';
import { ArtifactCandidateDto, ArtifactIntent, CandidateListDto } from '@/types/domain';

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

/** OA/HPC Service의 후보 한 건 — File Artifacts(Calypso)와 한 목록에 섞일 때 실제로
 * 어느 서비스에서 왔는지도 같이 들고 있어야 한다(칩·부제목·pick 둘 다에 필요). */
export interface LiveCandidateRow extends ArtifactCandidateDto {
  serviceKey: string;
  serviceName: string;
  source: 'live' | 'hpc';
}

/**
 * 등록된 모든 OA/HPC Service의 후보를 한 번에 병렬로 받아 평평한 배열 하나로 합친다
 * (사용자 요청 — 예전에는 서비스 행을 펼쳐야만 그 안의 후보가 보였는데, 그러면
 * File Artifacts만 먼저 보이고 검색을 해야만 OA/HPC 쪽이 나오는 것처럼 보였다. 이제
 * 피커를 열 때부터 전부 같이 요청한다).
 *
 * `useQueries`를 쓰는 이유 — 서비스 개수가 비동기로 도착하는 배열이라 그 길이만큼
 * `useArtifactCandidates`를 반복 호출할 수 없다(Hooks 규칙 위반). `useQueries`는 이런
 * "배열 길이만큼의 동적 쿼리"를 위해 있는 react-query 자체 API다.
 */
export function useAllLiveCandidates(
  workflowId: string | undefined,
  intent: ArtifactIntent,
  services: HubService[],
): { candidates: LiveCandidateRow[]; loadingKeys: string[] } {
  const results = useQueries({
    queries: services.map((s) => {
      const source: 'live' | 'hpc' = s.defaultTier === 'C' ? 'hpc' : 'live';
      return {
        queryKey: queryKeys.artifactCandidates(workflowId ?? '', source, intent, s.key),
        enabled: Boolean(workflowId),
        queryFn: async (): Promise<CandidateListDto> => {
          const res = await apiClient.get<CandidateListDto>(
            `/workflows/${workflowId}/artifact-candidates`,
            { params: { source, intent, serviceKey: s.key } },
          );
          return res.data;
        },
      };
    }),
  });

  const candidates: LiveCandidateRow[] = [];
  const loadingKeys: string[] = [];
  results.forEach((r, i) => {
    const s = services[i];
    if (r.isLoading) { loadingKeys.push(s.name); return; }
    if (!r.data?.supported) return;
    const source: 'live' | 'hpc' = s.defaultTier === 'C' ? 'hpc' : 'live';
    for (const c of r.data.candidates) {
      candidates.push({ ...c, serviceKey: s.key, serviceName: s.name, source });
    }
  });
  return { candidates, loadingKeys };
}
