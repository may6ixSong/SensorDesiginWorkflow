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
