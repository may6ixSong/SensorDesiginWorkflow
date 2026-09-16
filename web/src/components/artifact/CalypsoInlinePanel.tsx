import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalypsoVersionView, downloadCalypsoVersion, getCalypsoArtifact, releaseCalypsoArtifact, uploadCalypsoVersion,
} from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ReleaseDto } from '@/types/domain';
import { releaseBadgeMap } from '@/lib/releaseBadge';
import { toast } from '@/store/toastStore';
import { Ey } from '@/components/common/Panel';
import { ArtifactVersionContents } from './ArtifactVersionContents';
import { ArtifactVersionTree } from './ArtifactVersionTree';
import { T } from '@/theme/tokens';

interface Props {
  /** Calypso 쪽 산출물 id (artifact.externalArtifactId). */
  artifactId: string;
  /** SIREN project id — BE가 department를 계산하는 데 쓴다(설계서 07장 §2). */
  projectId: string;
  blockId: string;
  releases: ReleaseDto[];
  onOpenRelease?: (releaseId: string) => void;
}

/**
 * File Artifacts(B Tier)의 입출력을 슬라이드 안에서 직접 — 예전에는 Calypso 화면(현재는
 * SIREN의 독립 Artifact page, /artifacts/:id)까지 나가야만 업로드·다운로드·release가
 * 됐지만, 그 화면과 똑같은 컴포넌트(ArtifactVersionContents/Tree)를 그대로 여기 꽂아서
 * 캔버스를 벗어나지 않고도 되게 한다(사용자 요청).
 *
 * ★ Calypso 자체 editors/viewGrants 관리(ArtifactAccessPanel)는 여기서는 안 그린다 —
 *   슬라이드에는 이미 Recipients 탭이 같은 일(B Tier의 edit/view 권한)을 하므로 둘을
 *   같이 보여주면 겹친다(사용자 지적). 독립 Artifact page에는 Recipients 탭이 없으니
 *   거기서는 그대로 남는다.
 *
 * 버전 트리의 "이 workflow에서 release 여부" 배지만 이 컴포넌트가 얹는다 — 독립
 * Artifact page는 특정 workflow에 매인 화면이 아니라 그 배지를 모른다.
 */
export function CalypsoInlinePanel({ artifactId, projectId, blockId, releases, onOpenRelease }: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<CalypsoVersionView | null>(null);

  const { data: a, isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifact(artifactId),
    queryFn: () => getCalypsoArtifact(artifactId, projectId),
    retry: false,
  });

  useEffect(() => setPicked(null), [artifactId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifact(artifactId) });
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(projectId) });
  };

  const upload = useMutation({
    mutationFn: ({ file, note }: { file: File; note: string }) => uploadCalypsoVersion(artifactId, projectId, file, note),
    onSuccess: () => { invalidate(); toast('Working copy uploaded'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Upload failed'),
  });
  const release = useMutation({
    mutationFn: (note: string) => releaseCalypsoArtifact(artifactId, projectId, note),
    onSuccess: () => { invalidate(); toast('Published'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Publish failed'),
  });
  const handleDownload = async (v: CalypsoVersionView) => {
    // TODO: 지금은 첫 번째 파일만 내려받는다 — 한 버전이 여러 파일을 가질 수 있게 되면서
    // (설계서 04장 §2, §6) 파일별 개별 다운로드/전체 zip UI가 필요한데, 이번 변경 범위 밖이다.
    const file = v.files[0];
    if (!file) return;
    try {
      const blob = await downloadCalypsoVersion(artifactId, projectId, v.versionRef, file.storageKey);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName || `${artifactId}-v${v.versionLabel}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Download failed');
    }
  };

  if (isLoading) {
    return <Box sx={{ padding: '20px 0', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>Loading…</Box>;
  }
  if (isError || !a) {
    return <Box sx={{ padding: '20px 0', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>Could not load this artifact from Calypso.</Box>;
  }

  const shown = picked ?? a.latestVersion;
  const versions = a.versions ?? [];
  const relBadges = releaseBadgeMap(releases, blockId);
  const canEdit = a.myAccess === 'edit';

  return (
    // B(본문 — 이름/업로드/다운로드) : A(버전 트리 + 권한) = 2 : 1 — 독립 Artifact
    // page와 같은 자리 배치를 슬라이드 폭에 맞게 옮겨온다(사용자 요청).
    <Box sx={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <Box sx={{ flex: 2, minWidth: 0, borderRadius: '12px', overflow: 'hidden' }}>
        <ArtifactVersionContents
          a={a}
          version={shown}
          canEdit={canEdit}
          onDownload={handleDownload}
          onUpload={(file, note) => upload.mutate({ file, note })}
          onRelease={(note) => release.mutate(note)}
          uploading={upload.isPending}
          releasing={release.isPending}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Ey sx={{ mb: '10px' }}>Version history</Ey>
        <ArtifactVersionTree
          versions={versions}
          selected={shown}
          onSelect={setPicked}
          releaseBadgeFor={(v) => relBadges.get(v.versionLabel)}
          onOpenRelease={onOpenRelease}
        />
      </Box>
    </Box>
  );
}
