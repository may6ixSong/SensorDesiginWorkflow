import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalypsoGrantInput, CalypsoVersionView, addCalypsoEditor, addCalypsoViewGrant,
  downloadCalypsoVersion, getCalypsoArtifact, releaseCalypsoArtifact,
  removeCalypsoEditor, removeCalypsoViewGrant, setCalypsoUserDepartments, uploadCalypsoVersion,
} from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ReleaseDto } from '@/types/domain';
import { releaseBadgeMap } from '@/lib/releaseBadge';
import { toast } from '@/store/toastStore';
import { Ey } from '@/components/common/Panel';
import { ArtifactVersionContents } from './ArtifactVersionContents';
import { ArtifactVersionTree } from './ArtifactVersionTree';
import { ArtifactAccessPanel } from './ArtifactAccessPanel';
import { T } from '@/theme/tokens';

interface Props {
  /** Calypso 쪽 산출물 id (artifact.externalArtifactId). */
  artifactId: string;
  blockId: string;
  myDepartments: string[];
  allDepartments: string[];
  releases: ReleaseDto[];
  onOpenRelease?: (releaseId: string) => void;
}

/**
 * File Artifacts(B Tier)의 입출력을 슬라이드 안에서 직접 — 예전에는 Calypso 화면(현재는
 * SIREN의 독립 Artifact page, /artifacts/:id)까지 나가야만 업로드·다운로드·release가
 * 됐지만, 그 화면과 똑같은 컴포넌트(ArtifactVersionContents/Tree/AccessPanel)를 그대로
 * 여기 꽂아서 캔버스를 벗어나지 않고도 되게 한다(사용자 요청).
 *
 * 버전 트리의 "이 workflow에서 release 여부" 배지만 이 컴포넌트가 얹는다 — 독립
 * Artifact page는 특정 workflow에 매인 화면이 아니라 그 배지를 모른다.
 */
export function CalypsoInlinePanel({ artifactId, blockId, myDepartments, allDepartments, releases, onOpenRelease }: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<CalypsoVersionView | null>(null);

  const { data: a, isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifact(artifactId),
    queryFn: () => getCalypsoArtifact(artifactId),
    retry: false,
  });

  useEffect(() => { setCalypsoUserDepartments(myDepartments); }, [myDepartments]);
  useEffect(() => setPicked(null), [artifactId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifact(artifactId) });
    if (a) qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(a.projectId) });
  };

  const upload = useMutation({
    mutationFn: ({ file, note }: { file: File; note: string }) => uploadCalypsoVersion(artifactId, file, note),
    onSuccess: () => { invalidate(); toast('Working copy uploaded'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Upload failed'),
  });
  const release = useMutation({
    mutationFn: (note: string) => releaseCalypsoArtifact(artifactId, note),
    onSuccess: () => { invalidate(); toast('Published'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Publish failed'),
  });
  const addEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoEditor(artifactId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant edit access'),
  });
  const removeEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoEditor(artifactId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove editor'),
  });
  const addViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoViewGrant(artifactId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant view access'),
  });
  const removeViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoViewGrant(artifactId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove viewer'),
  });

  const handleDownload = async (v: CalypsoVersionView) => {
    try {
      const blob = await downloadCalypsoVersion(artifactId, v.versionRef);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = v.fileName || `${artifactId}-v${v.versionLabel}`;
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box sx={{ borderRadius: '12px', overflow: 'hidden' }}>
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

      <Box>
        <Ey sx={{ mb: '10px' }}>Version history</Ey>
        <ArtifactVersionTree
          versions={versions}
          selected={shown}
          onSelect={setPicked}
          releaseBadgeFor={(v) => relBadges.get(v.versionLabel)}
          onOpenRelease={onOpenRelease}
        />
      </Box>

      {canEdit && (
        <ArtifactAccessPanel
          artifact={a}
          myDepartments={myDepartments}
          allDepartments={allDepartments}
          onAddEditor={(g) => addEditor.mutate(g)}
          onRemoveEditor={(g) => removeEditor.mutate(g)}
          onAddViewGrant={(g) => addViewGrant.mutate(g)}
          onRemoveViewGrant={(g) => removeViewGrant.mutate(g)}
        />
      )}
    </Box>
  );
}
