import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import { ArtifactHtmlView, ArtifactIntent, ArtifactVersionDto, BlockDto } from '@/types/domain';

/**
 * artifactId(재사용) 대신 넘기면 서버가 그 자리에서 출처를 확정한다(find-or-create,
 * 설계서 04장 §6). HPC Service(C)는 더 이상 잠겨 있지 않다 — OA Service(A)와 동일한
 * 라이브 흐름이다(설계서 04장 §2, §6.2, §6.3).
 */
export interface NewArtifactSourceInput {
  source: 'live' | 'file' | 'hpc';
  name: string;
  serviceKey?: string;
  externalArtifactId?: string;
}

/**
 * 캔버스 블록 목록.
 *
 * ★ 각 항목에 그 산출물의 **권한 판정 결과가 이미 반영되어** 온다 — 권한이 없으면
 *   `artifact.masked === true`이고 버전·링크가 응답에 아예 없다. FE가 숨기는 게 아니다.
 * ★ Edit/View 권한자가 **완전히 동일한 캔버스**를 본다(설계서 03장 §1). 다르게 보이는
 *   것은 각 산출물의 버전뿐이고, 그건 산출물 하나하나마다 판정된다.
 */
export function useBlocks(workflowId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.blocks(workflowId ?? ''),
    enabled: Boolean(workflowId) && enabled,
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
 * 한 버전의 html preview(설계서 04장 §19 확장) — B Tier의 upload/download 화면 자리를
 * A/C Tier에서는 이걸로 대신한다. `enabled`는 그 버전이 `hasHtmlView`일 때만 켠다 —
 * 그렇지 않은 버전은 애초에 클릭도 안 되므로 이 훅에 닿지 않는다.
 *
 * ★ 서비스가 이 라우트를 구현하지 않았거나 실패하면 SIREN 백엔드가 null을 준다 — 그러면
 *   훅도 null을 그대로 돌려주고, 호출부는 "이전처럼 아무것도 안 그린다"로 처리한다.
 */
export function useHtmlView(
  workflowId: string | undefined,
  blockId: string | undefined,
  versionLabel: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.htmlView(workflowId ?? '', blockId ?? '', versionLabel ?? ''),
    enabled: Boolean(workflowId) && Boolean(blockId) && Boolean(versionLabel) && enabled,
    queryFn: async () => {
      const res = await apiClient.get<ArtifactHtmlView | null>(
        `/workflows/${workflowId}/blocks/${blockId}/html-view`,
        { params: { versionLabel } },
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
      intent?: ArtifactIntent;
      artifactId?: string | null;
      newArtifact?: NewArtifactSourceInput;
    }) => {
      const res = await apiClient.post<BlockDto>(`/workflows/${workflowId}/blocks`, input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) }),
  });
}

/** 이름 변경 / artifact 매핑 변경(재매핑). 매핑은 같은 과제의 artifact만 허용된다. */
export function useUpdateBlock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: {
      id: string;
      name?: string;
      artifactId?: string | null;
      newArtifact?: NewArtifactSourceInput;
    }) => {
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
 * **block의 recipient 교체** (설계서 04장 §3.2, §3.3) — A/B/C 전부 공통이다.
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
      departments?: string[];
      users?: string[];
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
