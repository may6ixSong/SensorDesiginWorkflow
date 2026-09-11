import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import { AccessGrant, ArtifactVersionDto, BlockDto } from '@/types/domain';

/**
 * 캔버스 블록 목록.
 *
 * ★ 각 항목에 그 산출물의 **권한 판정 결과가 이미 반영되어** 온다 — 권한이 없으면
 *   `artifact.masked === true`이고 버전·링크가 응답에 아예 없다. FE가 숨기는 게 아니다.
 * ★ Edit/View 권한자가 **완전히 동일한 캔버스**를 본다(설계서 03장 §1). 다르게 보이는
 *   것은 각 산출물의 버전뿐이고, 그건 산출물 하나하나마다 판정된다.
 */
export function useBlocks(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blocks(workflowId ?? ''),
    enabled: Boolean(workflowId),
    queryFn: async () => {
      const res = await apiClient.get<BlockDto[]>(`/workflows/${workflowId}/blocks`);
      return res.data;
    },
  });
}

/**
 * A Tier(Calypso 제외 Hub 등록 서비스)의 라이브 버전 조회 — v3 재설계 전에 있던
 * "member/version API를 그 서비스에 실제로 물어보는" 기능의 복원이다.
 *
 * ★ 캔버스 목록(useBlocks)의 `artifact.versions`는 이런 산출물에 대해선 매핑 당시의
 *   스냅샷일 뿐 라이브가 아니다 — 그래서 ArtifactSlide가 열렸을 때만, 그 block에
 *   대해서만 이 쿼리를 켠다(enabled).
 */
export function useLiveVersions(workflowId: string | undefined, blockId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.liveVersions(workflowId ?? '', blockId ?? ''),
    enabled: Boolean(workflowId) && Boolean(blockId) && enabled,
    queryFn: async () => {
      const res = await apiClient.get<ArtifactVersionDto[]>(
        `/workflows/${workflowId}/blocks/${blockId}/live-versions`,
      );
      return res.data;
    },
  });
}

/**
 * 새 블록. artifact 없이 만들 수 있다 — 자리만 잡아두고 출처는 나중에 지정하는 것이
 * 정상 빈 상태다(설계서 03장 §2.3).
 *
 * "새 Artifact 추가" 버튼은 하나로 통합되어 항상 내가 주는 산출물을 만든다.
 */
export function useCreateBlock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      phaseId: string;
      layout: { x: number; y: number; w: number; h: number };
      artifactId?: string | null;
    }) => {
      const res = await apiClient.post<BlockDto>(`/workflows/${workflowId}/blocks`, input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) }),
  });
}

/** 이름 변경 / artifact 매핑 변경. 매핑은 같은 과제의 artifact만 허용된다. */
export function useUpdateBlock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; artifactId?: string | null }) => {
      const res = await apiClient.patch<BlockDto>(`/blocks/${id}`, patch);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) }),
  });
}

export function useDeleteBlock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/blocks/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
      // 그 블록에 걸려 있던 flow도 서버가 함께 지웠다.
      qc.invalidateQueries({ queryKey: queryKeys.edges(workflowId) });
    },
  });
}

/**
 * **A Tier block의 recipient 교체** (설계서 04장 §3.3).
 *
 * B/C/D는 이 라우트를 쓰지 않는다 — 그쪽은 artifact.viewAccess가 곧 recipient이고
 * artifact 단위로 중앙 관리된다(useArtifacts의 useReplaceArtifactAccess).
 *
 * ★ 편집 권한은 그 workflow의 Edit Access다. recipient에 **속하는 것**과 recipient를
 *   **편집하는 것**은 별개라, 자기를 넣지 않으면 고쳐놓고도 그 slide를 못 열 수 있다.
 */
export function useReplaceBlockRecipients(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      blockId,
      ...input
    }: {
      blockId: string;
      editAccess: AccessGrant;
      viewAccess: AccessGrant;
    }) => {
      const res = await apiClient.patch<BlockDto>(
        `/workflows/${workflowId}/blocks/${blockId}/recipients`,
        input,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) }),
  });
}
