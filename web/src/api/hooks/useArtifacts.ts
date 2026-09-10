import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import { AccessGrant, ArtifactDto } from '@/types/domain';

/**
 * **B/C/D의 Edit/View 권한 교체** (설계서 04장 §3.2).
 *
 * `viewAccess`가 곧 recipient이므로 이 한 번의 쓰기가 열람 권한과 수신 대상을 동시에
 * 바꾼다. 그리고 이 값은 artifact 하나에 붙어 그 과제 안의 **모든 workflow에 동일하게**
 * 적용된다 — Calypso나 HPC 공용 DB처럼 권한이 한 군데서 중앙 관리되기 때문이다.
 *
 * A Tier는 서비스가 권한을 판정하므로 서버가 400으로 거부한다. A의 recipient는
 * block에 있다(useBlocks의 useReplaceBlockRecipients).
 */
export function useReplaceArtifactAccess(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artifactId,
      ...input
    }: {
      artifactId: string;
      editAccess: AccessGrant;
      viewAccess: AccessGrant;
    }) => {
      const res = await apiClient.put<ArtifactDto>(`/artifacts/${artifactId}/access`, input);
      return res.data;
    },
    onSuccess: () => {
      // 같은 artifact를 참조하는 다른 workflow의 캔버스도 영향을 받지만, 지금 화면에
      // 보이는 것만 갱신하면 충분하다 — 다른 workflow는 열 때 다시 조회된다.
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
    },
  });
}
