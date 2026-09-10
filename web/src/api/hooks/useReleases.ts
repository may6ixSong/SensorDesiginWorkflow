import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import { ReleaseDto, ReleasePreviewDto } from '@/types/domain';

/**
 * 지금 release하면 무엇이 나갈지 — 실행과 **같은 로직**으로 계산된 결과다.
 *
 * 이 호출은 연동 서비스에 라이브로 버전을 물어보므로 평소 캔버스 조회보다 느릴 수 있다.
 * 그래서 다이얼로그를 열 때만 부르고(enabled), 캐시를 오래 들고 있지 않는다.
 */
export function useReleasePreview(workflowId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.releasePreview(workflowId ?? ''),
    enabled: Boolean(workflowId) && enabled,
    // 미리보기와 실제 결과가 어긋나면 안 되므로 캐시를 재사용하지 않는다.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const res = await apiClient.get<ReleasePreviewDto>(`/workflows/${workflowId}/release/preview`);
      return res.data;
    },
  });
}

export function useReleases(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.releases(workflowId ?? ''),
    enabled: Boolean(workflowId),
    queryFn: async () => {
      const res = await apiClient.get<ReleaseDto[]>(`/workflows/${workflowId}/releases`);
      return res.data;
    },
  });
}

/**
 * Release 실행.
 *
 * ★ **철회·삭제가 불가능하다.** 되돌릴 수 없는 행위이므로 호출부는 반드시 confirm을
 *   거치고, 요청 중에는 버튼을 잠가 중복 클릭을 막는다(설계서 05장 §4.4, §4.5).
 * ★ sources는 `changed: true`인 항목에 대해서만 보낸다 — 나머지는 서버가 직전 release의
 *   선택을 그대로 이어받으므로 보낼 필요가 없고, 보내도 무시된다.
 */
export function useCreateRelease(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      note: string;
      sources?: Record<string, Record<string, string | null>>;
    }) => {
      const res = await apiClient.post<ReleaseDto>(`/workflows/${workflowId}/releases`, input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.releases(workflowId) });
      // release가 나가면 각 블록의 publish 배지 기준선(마지막 release의 major)이 바뀐다.
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}
