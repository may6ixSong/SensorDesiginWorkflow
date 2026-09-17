import { useEffect, useState } from 'react';
import { Box, CircularProgress, Stack } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { ArtifactVersionTree } from '@/components/artifact/ArtifactVersionTree';
import { ArtifactVersionContents } from '@/components/artifact/ArtifactVersionContents';
import { ArtifactAccessPanel } from '@/components/artifact/ArtifactAccessPanel';
import { AddVersionDialog } from '@/components/artifact/AddVersionDialog';
import { PublishVersionDialog } from '@/components/artifact/PublishVersionDialog';
import { NetworkField } from '@/components/artifact/NetworkField';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { queryKeys } from '@/api/queryKeys';
import {
  CalypsoGrantInput, CalypsoVersionView, addCalypsoEditor, addCalypsoVersion, addCalypsoViewGrant,
  downloadCalypsoVersion, getCalypsoArtifact, releaseCalypsoArtifact,
  removeCalypsoEditor, removeCalypsoViewGrant, setCalypsoNetwork, setCalypsoRestrictView,
} from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

/** A(내용+업로드):B(버전 트리) = 3:1 — workflow 쪽 상세 패널과 같은 비율(사용자 요청). */
export function ArtifactDetailPage() {
  const { id = '', projectId = '' } = useParams();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<CalypsoVersionView | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState<CalypsoVersionView | null>(null);

  const { data: a, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.calypsoArtifact(id),
    queryFn: () => getCalypsoArtifact(id, projectId),
    enabled: Boolean(id) && Boolean(projectId),
    retry: false,
  });
  const forbidden = (error as any)?.response?.status === 403;

  // "Details 클릭 시 view 권한 없다고 알림"(사용자 요청) — 403은 존재는 하지만 접근이
  // 없는 경우(findVisibleOrThrow)라 카드 문구와 별개로 toast로도 바로 알려준다.
  useEffect(() => {
    if (forbidden) toast('You do not have view access to this artifact.');
  }, [forbidden]);

  useEffect(() => setPicked(null), [id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifact(id) });
    if (projectId) qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(projectId) });
  };

  const upload = useMutation({
    mutationFn: ({ input, versionNote, description }: {
      input: { files?: File[]; viewUrl?: string; hpcPath?: string }; versionNote: string; description: string;
    }) => addCalypsoVersion(id, projectId, input, versionNote, description),
    onSuccess: () => { invalidate(); toast('Version added'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not add version'),
  });
  const release = useMutation({
    mutationFn: ({ versionNote, description, sourceVersionRef }: { versionNote: string; description: string; sourceVersionRef?: string }) =>
      releaseCalypsoArtifact(id, projectId, versionNote, description, sourceVersionRef),
    onSuccess: () => { invalidate(); toast('Published'); setPublishing(null); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Publish failed'),
  });
  const addEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoEditor(id, projectId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant edit access'),
  });
  const removeEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoEditor(id, projectId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove editor'),
  });
  const addViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoViewGrant(id, projectId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant view access'),
  });
  const removeViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoViewGrant(id, projectId, g),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove viewer'),
  });
  const restrictView = useMutation({
    mutationFn: (v: boolean) => setCalypsoRestrictView(id, projectId, v),
    onSuccess: invalidate,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not change view access'),
  });
  const network = useMutation({
    mutationFn: (network: 'OA' | 'HPC') => setCalypsoNetwork(id, projectId, network),
    onSuccess: () => { invalidate(); toast('Network changed'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not change network'),
  });

  const handleDownload = async (v: CalypsoVersionView) => {
    try {
      const { blob, filename } = await downloadCalypsoVersion(id, projectId, v.versionRef);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? `${id}-v${v.versionLabel}`;
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
          <Box sx={{ fontSize: 14, fontWeight: 600 }}>
            {forbidden ? 'You do not have view access to this artifact' : 'Could not load this artifact'}
          </Box>
          <Box sx={{ fontSize: 12.5, color: T.dm }}>
            {forbidden
              ? 'Ask its registrant or an editor to grant you access.'
              : 'It may not exist in Calypso, or the link is stale.'}
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
            to={`/projects/${projectId}/artifacts`}
            sx={{ fontSize: 11.5, color: T.dm, textDecoration: 'none', '&:hover': { color: T.tx } }}
          >
            ← Artifacts
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '4px' }}>
            <Box sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{a.name}</Box>
            <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{a.department}</Badge>
            {a.myAccess === 'view' && <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>View only</Badge>}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Box sx={{ flex: 3, minWidth: 0, display: 'flex', borderRight: `1px solid ${T.ln}` }}>
            <ArtifactVersionContents a={a} version={shown} onDownload={handleDownload} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 320, background: T.sf2, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Box>
              <NetworkField
                a={a}
                canEdit={a.myAccess === 'edit'}
                changing={network.isPending}
                onChange={(kind) => network.mutate(kind)}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '10px' }}>
                <Box sx={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>Version history</Box>
                {a.myAccess === 'edit' && (
                  <SirenButton onClick={() => setAddOpen(true)}>
                    <Icon name="plus" size={12} /> Add a new version
                  </SirenButton>
                )}
              </Box>
              <ArtifactVersionTree
                versions={versions}
                selected={shown}
                onSelect={setPicked}
                canPublish={a.myAccess === 'edit'}
                onPublish={setPublishing}
              />
            </Box>
            {a.myAccess === 'edit' && (
              <ArtifactAccessPanel
                artifact={a}
                projectId={projectId}
                onAddEditor={(g) => addEditor.mutate(g)}
                onRemoveEditor={(g) => removeEditor.mutate(g)}
                onAddViewGrant={(g) => addViewGrant.mutate(g)}
                onRemoveViewGrant={(g) => removeViewGrant.mutate(g)}
                onSetRestrictView={(v) => restrictView.mutate(v)}
              />
            )}
          </Box>
        </Box>
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
    </AppShell>
  );
}
