import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

/** Hub 레지스트리 항목 (설계서 §3.2). */
export interface HubService {
  key: string;
  name: string;
  contractVersion: string;
  defaultTier: 'A' | 'B' | 'C' | 'D';
  transport: 'http' | 'shared-db' | 'none';
  baseUrl: string | null;
  viewUrlTemplate: string | null;
  embedUploadUrlTemplate: string | null;
  isBuiltIn: boolean;
  enabled: boolean;
}

/**
 * 대문의 슬랩이 이 목록으로 그려진다 (설계서 §15.4) — 하드코딩된 목록이 아니라
 * 실제 Hub 상태를 반영한다.
 *
 * 레지스트리가 비었거나 조회에 실패하면 빈 배열을 준다. 그때 대문은 슬랩 없이
 * 렌더하고, 설명 문구를 대신 띄우지 않는다(§14.1, §15.4).
 */
export function useHubServices() {
  const { data, isLoading } = useQuery({
    queryKey: ['hub', 'services'],
    queryFn: async (): Promise<HubService[]> => {
      const { data } = await apiClient.get('/hub/services');
      return data.data;
    },
    staleTime: 60_000,
    retry: false,
  });

  return { services: data ?? [], isLoading };
}

export interface ShowcaseItem {
  name: string;
  versionLabel: string;
  isReleased: boolean;
}

/**
 * 대문 슬랩에 얹을 대표 산출물 몇 개 (설계서 §15.4) — 서비스 메타데이터만으로는
 * 바둑판 위에 빈 판넬만 떠 있는 것처럼 보이므로, 원본 3D 맵처럼 실제 버전 카드를
 * 보여주기 위한 조회. giver 맥락이 없는 자리라 released 버전만 온다.
 */
export function useHubShowcase(serviceKey: string) {
  const { data } = useQuery({
    queryKey: ['hub', 'showcase', serviceKey],
    queryFn: async (): Promise<ShowcaseItem[]> => {
      const { data } = await apiClient.get(`/hub/services/${serviceKey}/showcase`);
      return data.data;
    },
    enabled: !!serviceKey,
    staleTime: 60_000,
    retry: false,
  });
  return data ?? [];
}
