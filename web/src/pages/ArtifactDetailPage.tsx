import { useEffect, useState } from 'react';
import { Box, CircularProgress, Stack } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { ArtifactVersionTree } from '@/components/artifact/ArtifactVersionTree';
import { ArtifactVersionContents } from '@/components/artifact/ArtifactVersionContents';
import { Badge } from '@/components/common/SirenButton';
import { queryKeys } from '@/api/queryKeys';
import {
  CalypsoVersionView, downloadCalypsoVersion, getCalypsoArtifact,
  releaseCalypsoArtifact, uploadCalypsoVersion,
} from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

/** A(내용+업로드):B(버전 트리) = 3:1 — workflow 쪽 상세 패널과 같은 비율(사용자 요청). */
export function ArtifactDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<CalypsoVersionView | null>(null);

  const { data: a, isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifact(id),
    queryFn: () => getCalypsoArtifact(id),
    enabled: Boolean(id),
    retry: false,
  });

  useEffect(() => setPicked(null), [id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifact(id) });
    if (a) qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(a.projectId) });
  };

  const upload = useMutation({
    mutationFn: ({ file, note }: { file: File; note: string }) => uploadCalypsoVersion(id, file, note),
    onSuccess: () => { invalidate(); toast('Working copy uploaded'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Upload failed'),
  });
  const release = useMutation({
    mutationFn: (note: string) => releaseCalypsoArtifact(id, note),
    onSuccess: () => { invalidate(); toast('Released'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Release failed'),
  });

  const handleDownload = async (v: CalypsoVersionView) => {
    try {
      const blob = await downloadCalypsoVersion(id, v.versionRef);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = v.fileName || `${id}-v${v.versionLabel}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Download failed');
    }
  };

  if (isError) {
    return (
      <AppShell>
        <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, gap: '10px' }}>
          <Box sx={{ fontSize: 14, fontWeight: 600 }}>Could not load this artifact</Box>
          <Box sx={{ fontSize: 12.5, color: T.dm }}>
            It may not exist in Calypso, or the link is stale.
          </Box>
        </Stack>
      </AppShell>
    );
  }

  if (isLoading || !a) {
    return (
      <AppShell>
        <Stack alignItems="center" justifyContent="center" sx={{ flex: 1 }}>
          {isLoading && <CircularProgress size={26} />}
        </Stack>
      </AppShell>
    );
  }

  const shown = picked ?? a.latestVersion;
  const versions = a.versions ?? [];

  return (
    <AppShell>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: '0 0 auto', padding: '15px 22px', borderBottom: `1px solid ${T.ln}`, background: T.sf }}>
          <Box
            component={Link}
            to={`/projects/${a.projectId}/artifacts`}
            sx={{ fontSize: 11.5, color: T.dm, textDecoration: 'none', '&:hover': { color: T.tx } }}
          >
            ← Artifacts
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '4px' }}>
            <Box sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{a.name}</Box>
            <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{a.department}</Badge>
            {a.canEdit && <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>You registered this</Badge>}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Box sx={{ flex: 3, minWidth: 0, display: 'flex', borderRight: `1px solid ${T.ln}` }}>
            <ArtifactVersionContents
              a={a}
              version={shown}
              canEdit={a.canEdit}
              onDownload={handleDownload}
              onUpload={(file, note) => upload.mutate({ file, note })}
              onRelease={(note) => release.mutate(note)}
              uploading={upload.isPending}
              releasing={release.isPending}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 320, background: T.sf2, overflowY: 'auto', padding: '16px' }}>
            <Box sx={{ fontSize: 12.5, fontWeight: 700, mb: '10px' }}>Version history</Box>
            <ArtifactVersionTree versions={versions} selected={shown} onSelect={setPicked} />
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}
