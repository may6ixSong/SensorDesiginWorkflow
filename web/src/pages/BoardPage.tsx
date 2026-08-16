import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { IpHeader } from '@/components/ip/IpHeader';
import { Canvas } from '@/components/canvas/Canvas';
import { DeliverableDialog } from '@/components/dialogs/DeliverableDialog';
import { HldReleaseDialog } from '@/components/dialogs/HldReleaseDialog';
import { PhaseInfoDialog } from '@/components/dialogs/PhaseInfoDialog';
import { IpPermissionDialog } from '@/components/dialogs/IpPermissionDialog';
import { AddDeliverableDialog } from '@/components/dialogs/AddDeliverableDialog';
import { NoteDialog } from '@/components/dialogs/NoteDialog';
import { Toast } from '@/components/common/Toast';
import { useProjectIps, useProjectPhases, useProjects } from '@/api/hooks/useProjects';
import { useAddOwner, useAddViewGrant, useIp, useRemoveOwner, useRemoveViewGrant } from '@/api/hooks/useIp';
import {
  useAddVersion, useCreateDeliverable, useDeliverables, useRelease,
  useUpdateDeliverable, useUpdateRecv, useUpdateSchedule,
} from '@/api/hooks/useDeliverables';
import { useMemos } from '@/api/hooks/useMemos';
import { useEdges } from '@/api/hooks/useEdges';
import { useHldReleases } from '@/api/hooks/useHld';
import { useUsers } from '@/api/hooks/useUsers';
import { usePutCanvas } from '@/api/hooks/useCanvas';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { toCanvasEdge, toCanvasMemo, toCanvasNode } from '@/lib/canvasModel';
import { T } from '@/theme/tokens';

export function BoardPage() {
  const { projectId, ipId } = useParams<{ projectId: string; ipId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const { data: projects } = useProjects();
  const { data: phases } = useProjectPhases(projectId);
  const { data: ips } = useProjectIps(projectId);
  const { data: ip, isLoading: ipLoading } = useIp(ipId);
  const { data: deliverables } = useDeliverables(ipId);
  const { data: memos } = useMemos(ipId);
  const { data: edges } = useEdges(ipId);
  const { data: hlds } = useHldReleases(ipId);
  const { data: users } = useUsers();

  const st = useCanvasStore;
  const edit = useCanvasStore((s) => s.edit);
  const recv = useCanvasStore((s) => s.recv);
  const nodes = useCanvasStore((s) => s.nodes);
  const canvasMemos = useCanvasStore((s) => s.memos);
  const openId = useCanvasStore((s) => s.openId);
  const noteDlg = useCanvasStore((s) => s.noteDlg);
  const addDlg = useCanvasStore((s) => s.addDlg);
  const hldDlg = useCanvasStore((s) => s.hldDlg);
  const hldSel = useCanvasStore((s) => s.hldSel);
  const hldBack = useCanvasStore((s) => s.hldBack);
  const phInfo = useCanvasStore((s) => s.phInfo);
  const ownerDlg = useCanvasStore((s) => s.ownerDlg);

  const putCanvas = usePutCanvas(ipId ?? '');
  const createDeliverable = useCreateDeliverable(ipId ?? '');
  const updateDeliverable = useUpdateDeliverable(ipId ?? '');
  const updateRecv = useUpdateRecv(ipId ?? '');
  const updateSchedule = useUpdateSchedule(ipId ?? '');
  const addVersion = useAddVersion(ipId ?? '');
  const release = useRelease(ipId ?? '');
  const addOwner = useAddOwner(ipId ?? '');
  const removeOwner = useRemoveOwner(ipId ?? '');
  const addViewGrant = useAddViewGrant(ipId ?? '');
  const removeViewGrant = useRemoveViewGrant(ipId ?? '');

  /* 서버 데이터 → 캔버스 작업 모델 (편집 중에는 덮어쓰지 않는다) */
  useEffect(() => {
    if (!ipId || !deliverables || !memos || !edges) return;
    if (st.getState().edit) return;
    st.getState().hydrate(ipId, {
      nodes: deliverables.map(toCanvasNode),
      memos: memos.map(toCanvasMemo),
      edges: edges.map(toCanvasEdge),
    });
  }, [ipId, deliverables, memos, edges, st]);

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const isOwner = ip?.myAccess === 'edit';
  const canEdit = !!isOwner && !recv; // 목업 canEd()
  const own = !!isOwner && !recv; // 목업 own = isOwn(ip) && !S.recv

  const openNode = useMemo(() => nodes.find((n) => n.id === openId) ?? null, [nodes, openId]);
  const phaseList = phases ?? [];

  const closeDeliverable = () => {
    const s = st.getState();
    s.openDeliverable(null);
    if (s.hldBack) {
      s.setHldBack(false);
      s.setHldDlg(true, s.hldSel);
    }
  };

  /* 편집 종료 시 캔버스 일괄 저장 (설계서 5.5) */
  const saveLayout = () => {
    const s = st.getState();
    putCanvas.mutate(
      {
        deliverables: s.nodes.map((n) => ({
          id: n.id,
          layout: { x: n.x, y: n.y, w: n.w, h: n.h },
          phaseKey: n.phase,
        })),
        memos: s.memos.map((m) => ({
          phaseKey: m.phase,
          text: m.text,
          layout: { x: m.x, y: m.y, w: m.w, h: m.h },
        })),
        edges: s.edges.map((e) => ({
          fromId: e.from,
          toId: e.to,
          bidirectional: e.bidirectional,
          auto: e.auto,
        })),
      },
      {
        onSuccess: () => toast('Layout saved'),
        onError: () => toast('Save failed'),
      },
    );
  };

  if (ipLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <AppShell
      projects={projects ?? []}
      projectId={projectId}
      onChangeProject={(id) => navigate(`/details/${id}`)}
      ips={ips ?? []}
      ipId={ipId}
      onChangeIp={(id) => navigate(`/details/${projectId}/${id}`)}
      users={users ?? []}
      canToggleRecv={!!isOwner}
    >
      {!ip ? (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>
              No viewable IP
            </Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              {me?.name} has no access to this program's Analog IPs.
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          <IpHeader
            ip={ip}
            recv={recv}
            onOpenPermissions={() => st.getState().setOwnerDlg(true)}
            onOpenHld={() => st.getState().setHldDlg(true, null)}
          />
          <Canvas
            ip={ip}
            phases={phaseList}
            usersById={usersById}
            canEdit={canEdit}
            onSaveLayout={saveLayout}
          />

          {openNode && (
            <DeliverableDialog
              node={openNode}
              phases={phaseList}
              usersById={usersById}
              users={users ?? []}
              own={own}
              onClose={closeDeliverable}
              onSaveInfo={({ name, net, type, phaseKeys }) => {
                updateDeliverable.mutate(
                  { id: openNode.id, name, docType: type, network: net },
                  {
                    onSuccess: () => {
                      const sid = openNode.series || openNode.id;
                      const before = nodes.filter((x) => (x.series || x.id) === sid).map((x) => x.phase).sort().join(',');
                      const after = [...phaseKeys].sort().join(',');
                      if (before !== after) {
                        updateSchedule.mutate(
                          { id: sid, phaseKeys },
                          { onSuccess: () => toast(`Release schedule: ${phaseKeys.length} phase(s)`) },
                        );
                      } else {
                        toast('Saved');
                      }
                      closeDeliverable();
                    },
                    onError: () => toast('Save failed'),
                  },
                );
              }}
              onUpload={({ file, note, net, type }) => {
                addVersion.mutate(
                  {
                    id: openNode.id,
                    fileName: file,
                    ...(net === 'HPC' ? { hpcPath: file } : { storageKey: `mock/${file}` }),
                    note,
                  },
                  {
                    onSuccess: () => {
                      if (net !== openNode.net || type !== openNode.type) {
                        updateDeliverable.mutate({ id: openNode.id, network: net, docType: type });
                      }
                      toast('Working copy uploaded');
                    },
                    onError: () => toast('Upload failed'),
                  },
                );
              }}
              onRelease={() =>
                release.mutate(
                  { id: openNode.id },
                  { onSuccess: () => toast('Released'), onError: () => toast('Release failed') },
                )
              }
              onSaveRecv={({ recvDept, recvContact }) =>
                updateRecv.mutate(
                  { id: openNode.id, recvDept, recvContact },
                  {
                    onSuccess: () => toast('Handoff info saved'),
                    onError: () => toast('Failed to save recipient department'),
                  },
                )
              }
              onAddLink={(toId) => {
                const s = st.getState();
                if (!s.edges.some((e) => e.from === openNode.id && e.to === toId)) {
                  s.setEdges([
                    ...s.edges,
                    { id: `tmp-${Date.now()}`, from: openNode.id, to: toId, auto: false, bidirectional: false },
                  ]);
                  toast('Linked — applies once you save the layout');
                }
              }}
              onUnlink={(edgeId) => {
                const s = st.getState();
                s.setEdges(s.edges.filter((e) => e.id !== edgeId));
                toast('Unlinked — applies once you save the layout');
              }}
            />
          )}

          {hldDlg && (
            <HldReleaseDialog
              ipName={ip.name}
              releases={hlds ?? []}
              nodes={nodes}
              phases={phaseList}
              usersById={usersById}
              selectedId={hldSel}
              onSelect={(id) => st.getState().setHldSel(id)}
              onClose={() => st.getState().setHldDlg(false)}
              onOpenRow={(id) => {
                const s = st.getState();
                s.setHldDlg(false, s.hldSel);
                s.setHldBack(true);
                s.openDeliverable(id);
              }}
            />
          )}

          {phInfo && phaseList.find((p) => p.key === phInfo) && (
            <PhaseInfoDialog
              ipName={ip.name}
              phase={phaseList.find((p) => p.key === phInfo)!}
              nodes={nodes}
              onClose={() => st.getState().setPhInfo(null)}
              onOpenRow={(id) => {
                st.getState().setPhInfo(null);
                st.getState().openDeliverable(id);
              }}
            />
          )}

          {ownerDlg && (
            <IpPermissionDialog
              ip={ip}
              users={users ?? []}
              own={!!isOwner}
              onClose={() => st.getState().setOwnerDlg(false)}
              onAddOwner={(id) =>
                addOwner.mutate(id, {
                  onSuccess: () => toast('Edit access added'),
                  onError: (e: any) =>
                    toast(e?.response?.data?.message ?? 'Failed to add'),
                })
              }
              onRemoveOwner={(id) => removeOwner.mutate(id)}
              onAddViewGrant={(userId, department) =>
                addViewGrant.mutate({ userId, department }, { onSuccess: () => toast('View access added') })
              }
              onRemoveViewGrant={(id) => removeViewGrant.mutate(id)}
            />
          )}

          {addDlg && (
            <AddDeliverableDialog
              ipName={ip.name}
              phases={phaseList}
              onClose={() => st.getState().setAddDlg(false)}
              onCreate={(p) =>
                createDeliverable.mutate(p, {
                  onSuccess: () => {
                    st.getState().setAddDlg(false);
                    toast('Deliverable added');
                  },
                  onError: () => toast('Failed to add'),
                })
              }
            />
          )}

          {noteDlg && (
            <NoteDialog
              text={canvasMemos.find((m) => m.id === noteDlg)?.text ?? ''}
              onClose={() => st.getState().setNoteDlg(null)}
              onSave={(text) => {
                const s = st.getState();
                s.setMemos(s.memos.map((m) => (m.id === noteDlg ? { ...m, text } : m)));
                s.setNoteDlg(null);
                toast('Memo saved');
              }}
              onDelete={() => {
                const s = st.getState();
                s.setMemos(s.memos.filter((m) => m.id !== noteDlg));
                s.setNoteDlg(null);
                toast('Memo deleted');
              }}
            />
          )}
        </>
      )}
      <Toast />
    </AppShell>
  );
}
