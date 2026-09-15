import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import { AccessGrant, ArtifactDto } from '@/types/domain';

/**
 * **D(External/Attested)의 Edit/View 권한 교체** (설계서 04장 §3.2, §3.5).
 *
 * `viewAccess`가 곧 recipient이므로 이 한 번의 쓰기가 열람 권한과 수신 대상을 동시에
 * 바꾼다. A/B/C(OA Service/File Artifacts/HPC Service)는 전부 그 서비스가 권한을
 * 판정하고 recipient는 block 단위이므로 서버가 이 라우트를 400으로 거부한다 — 그
 * recipient는 block에 있다(useBlocks의 useReplaceBlockRecipients).
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
