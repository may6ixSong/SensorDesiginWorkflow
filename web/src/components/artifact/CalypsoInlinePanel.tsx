import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalypsoVersionView, addCalypsoVersion, downloadCalypsoVersion, getCalypsoArtifact, releaseCalypsoArtifact,
} from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ReleaseDto } from '@/types/domain';
import { releaseBadgeMap } from '@/lib/releaseBadge';
import { toast } from '@/store/toastStore';
import { Ey } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { ArtifactVersionContents } from './ArtifactVersionContents';
import { ArtifactVersionTree } from './ArtifactVersionTree';
import { AddVersionDialog } from './AddVersionDialog';
import { PublishVersionDialog } from './PublishVersionDialog';
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
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState<CalypsoVersionView | null>(null);

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
    mutationFn: ({ input, versionNote, description }: {
      input: { files?: File[]; viewUrl?: string; hpcPath?: string }; versionNote: string; description: string;
    }) => addCalypsoVersion(artifactId, projectId, input, versionNote, description),
    onSuccess: () => { invalidate(); toast('Version added'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not add version'),
  });
  const release = useMutation({
    mutationFn: ({ versionNote, description, sourceVersionRef }: { versionNote: string; description: string; sourceVersionRef?: string }) =>
      releaseCalypsoArtifact(artifactId, projectId, versionNote, description, sourceVersionRef),
    onSuccess: () => { invalidate(); toast('Published'); setPublishing(null); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Publish failed'),
  });
  const handleDownload = async (v: CalypsoVersionView) => {
    try {
      const { blob, filename } = await downloadCalypsoVersion(artifactId, projectId, v.versionRef);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `${artifactId}-v${v.versionLabel}`;
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
        <ArtifactVersionContents a={a} version={shown} onDownload={handleDownload} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '10px' }}>
          <Ey sx={{ flex: 1, mb: 0 }}>Version history</Ey>
          {canEdit && (
            <SirenButton onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={12} /> Add a new version
            </SirenButton>
          )}
        </Box>
        <ArtifactVersionTree
          versions={versions}
          selected={shown}
          onSelect={setPicked}
          releaseBadgeFor={(v) => relBadges.get(v.versionLabel)}
          onOpenRelease={onOpenRelease}
          canPublish={canEdit}
          onPublish={setPublishing}
        />
      </Box>

      {addOpen && (
        <AddVersionDialog
          a={a}
          onSubmit={(input, versionNote, description) => upload.mutate({ input, versionNote, description })}
          submitting={upload.isPending}
          onClose={() => setAddOpen(false)}
        />
      )}
      {publishing && (
        <PublishVersionDialog
          a={a}
          version={publishing}
          submitting={release.isPending}
          onConfirm={(versionNote, description) => release.mutate({ versionNote, description, sourceVersionRef: publishing.versionRef })}
          onClose={() => setPublishing(null)}
        />
      )}
    </Box>
  );
}
