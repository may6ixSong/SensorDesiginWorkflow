import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { IpHeader } from '@/components/ip/IpHeader';
import { Canvas } from '@/components/canvas/Canvas';
import { DeliverableDialog } from '@/components/dialogs/DeliverableDialog';
import { IncomingDeliverableDialog } from '@/components/dialogs/IncomingDeliverableDialog';
import { HldReleaseDialog } from '@/components/dialogs/HldReleaseDialog';
import { PhaseInfoDialog } from '@/components/dialogs/PhaseInfoDialog';
import { IpPermissionDialog } from '@/components/dialogs/IpPermissionDialog';
import { AddDeliverableDialog } from '@/components/dialogs/AddDeliverableDialog';
import { NoteDialog } from '@/components/dialogs/NoteDialog';
import { Toast } from '@/components/common/Toast';
import { useProjectIpDirectory, useProjectIps, useProjectPhases, useProjects } from '@/api/hooks/useProjects';
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
import { placeIncomingNodes, placeInLane, toCanvasEdge, toCanvasMemo, toCanvasNode } from '@/lib/canvasModel';
import { DeliverableDto, PhaseRef } from '@/types/domain';
import { T } from '@/theme/tokens';

export function BoardPage() {
  const { projectId, ipId } = useParams<{ projectId: string; ipId: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const { data: projects } = useProjects();
  const { data: phases } = useProjectPhases(projectId);
  const { data: ips } = useProjectIps(projectId);
  const { data: ipDirectory } = useProjectIpDirectory(projectId);
  const { data: ip, isLoading: ipLoading } = useIp(ipId);
  const { data: deliverablesResp } = useDeliverables(ipId);
  const deliverables = deliverablesResp?.data;
  const incoming = useMemo(() => deliverablesResp?.incoming ?? [], [deliverablesResp]);
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
  const incomingId = useCanvasStore((s) => s.incomingId);

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

  /**
   * 서버 데이터 → 캔버스 작업 모델 (편집 중에는 덮어쓰지 않는다).
   * own(이 IP가 주는 산출물)과 incoming(다른 IP로부터 받는 산출물)을 하나의 nodes
   * 배열로 합쳐서 같은 캔버스 위에 그린다 — incoming은 origin==='incoming'으로
   * 표시돼 UI만 구분되고(점선 테두리 등), 그 외에는 own 노드와 똑같이 edge로 자유롭게
   * 연결할 수 있어 "받아서 → 내가 작업해서 → 다음으로 넘긴다"는 흐름이 한 캔버스에
   * 이어져 보인다. incoming은 이 IP 소유가 아니라 위치를 저장할 곳이 없으므로,
   * hydrate 직후 placeIncomingNodes로 own 노드와 겹치지 않는 자리에 매번 다시 배치한다.
   */
  useEffect(() => {
    if (!ipId || !deliverables || !memos || !edges) return;
    if (st.getState().edit) return;
    st.getState().hydrate(ipId, {
      nodes: [
        ...deliverables.map((d) => toCanvasNode(d, 'own')),
        ...incoming.map((d) => toCanvasNode(d, 'incoming')),
      ],
      memos: memos.map(toCanvasMemo),
      edges: edges.map(toCanvasEdge),
    });
    const s = st.getState();
    placeIncomingNodes(s.nodes, phases ?? [], s.phasePW);
    // 사용자가 같은 Phase 안에서 옮겨둔 incoming 노드 위치를 다시 덮어씌운다 — 그
    // Phase로 재배치된 것이 아니면(다른 IP가 스케줄을 바꿨으면) 무시한다.
    const overrides = s.incomingOverrides;
    s.nodes.forEach((n) => {
      const ov = overrides[n.id];
      if (n.origin === 'incoming' && ov && ov.phase === n.phase) {
        n.x = ov.x;
        n.y = ov.y;
      }
    });
    s.bumpBlocks();
  }, [ipId, deliverables, incoming, memos, edges, phases, st]);

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const isOwner = ip?.myAccess === 'edit';
  const canEdit = !!isOwner && !recv; // 목업 canEd()
  const own = !!isOwner && !recv; // 목업 own = isOwn(ip) && !S.recv

  const openNode = useMemo(() => nodes.find((n) => n.id === openId) ?? null, [nodes, openId]);
  const incomingNode = useMemo(() => incoming.find((d) => d.id === incomingId) ?? null, [incoming, incomingId]);
  const phaseList = phases ?? [];

  const closeDeliverable = () => {
    const s = st.getState();
    s.openDeliverable(null);
    if (s.hldBack) {
      s.setHldBack(false);
      s.setHldDlg(true, s.hldSel);
    }
  };

  /* 편집 종료 시 캔버스 일괄 저장 (설계서 5.5). Canvas는 저장이 끝난 뒤(성공/실패
   * 무관)에만 편집 모드를 종료한다 — 그 전에 종료하면 disabled였던 조회 쿼리가
   * 재활성화되며 아직 저장되지 않은 로컬 편집 결과를 stale 서버 데이터로 덮어쓸 수 있다. */
  const saveLayout = (onSettled?: () => void) => {
    const s = st.getState();
    putCanvas.mutate(
      {
        // origin==='incoming'은 다른 IP 소유라 이 IP의 캔버스 저장 대상이 아니다.
        deliverables: s.nodes
          .filter((n) => n.origin !== 'incoming')
          .map((n) => ({
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
        onSuccess: () => { toast('Layout saved'); onSettled?.(); },
        onError: () => { toast('Save failed'); onSettled?.(); },
      },
    );
  };

  /**
   * 산출물 생성/Release 일정(series) 변경 결과를 로컬 캔버스에 즉시 반영한다.
   * `useDeliverables` 쿼리는 편집 중엔 disabled라 invalidate만으로는 화면에 나타나지
   * 않는다(설계서 7.1) — 그래서 응답으로 받은 DTO를 직접 store에 병합한다.
   * 이미 로컬에 있던 노드는 위치/크기(x,y,w,h,phase)를 보존하고 메타데이터만 갱신하고,
   * 새로 생긴 노드만 해당 Phase 레인 안쪽으로 배치한다(placeInLane) — 그렇지 않으면
   * 서버 기본 좌표(0,0)가 그대로 쓰여 phase 라벨과 실제 표시 위치가 어긋난다.
   */
  const mergeDeliverableResults = (list: DeliverableDto[], phaseListForPlacement: PhaseRef[]) => {
    const s = st.getState();
    const existingById = new Map(s.nodes.map((n) => [n.id, n]));
    const touched = list.map((d) => {
      const local = existingById.get(d.id);
      if (local) {
        return {
          ...local,
          name: d.name,
          type: d.docType,
          net: d.network,
          series: d.series,
          seriesIdx: d.seriesIdx,
          seriesTotal: d.seriesTotal,
          recvDept: d.recvDept,
          recvContact: d.recvContact,
          recvIpId: d.recvIpId,
          sourceDept: d.sourceDept,
          versions: d.versions ?? [],
          canEdit: d.canEdit,
        };
      }
      const fresh = toCanvasNode(d);
      placeInLane(fresh, phaseListForPlacement, s.phasePW);
      return fresh;
    });
    const untouched = s.nodes.filter((n) => !touched.some((t) => t.id === n.id));
    s.setNodes([...untouched, ...touched]);
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
      canToggleRecv={!!isOwner}
    >
      {!ip ? (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>
              No viewable IP
            </Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              {me?.name} has no access to this project's Analog IPs.
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
            onOpenIncoming={(id) => st.getState().setIncomingId(id)}
            ipDirectory={ipDirectory ?? []}
            onSaveLayout={saveLayout}
          />

          {openNode && (
            <DeliverableDialog
              node={openNode}
              phases={phaseList}
              usersById={usersById}
              users={users ?? []}
              own={own}
              ipDirectory={ipDirectory ?? []}
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
                          {
                            onSuccess: (list) => {
                              mergeDeliverableResults(list, phaseList);
                              toast(`Release schedule: ${phaseKeys.length} phase(s)`);
                            },
                            onError: () => toast('Failed to update release schedule'),
                          },
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
              onSaveRecv={({ recvDept, recvContact, recvIpId, sourceDept }) =>
                updateRecv.mutate(
                  { id: openNode.id, recvDept, recvContact, recvIpId, sourceDept },
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

          {incomingNode && (
            <IncomingDeliverableDialog
              d={incomingNode}
              phases={phaseList}
              usersById={usersById}
              onClose={() => st.getState().setIncomingId(null)}
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
              onCreate={({ name, phaseKeys, docType, network }) => {
                const [firstPhase, ...rest] = phaseKeys;
                createDeliverable.mutate(
                  { name, phaseKey: firstPhase, docType, network },
                  {
                    onSuccess: (created) => {
                      const s = st.getState();
                      const fresh = toCanvasNode(created);
                      placeInLane(fresh, phaseList, s.phasePW);
                      s.setNodes([...s.nodes, fresh]);
                      st.getState().setAddDlg(false);
                      if (rest.length) {
                        updateSchedule.mutate(
                          { id: created.id, phaseKeys },
                          {
                            onSuccess: (list) => {
                              mergeDeliverableResults(list, phaseList);
                              st.getState().setFocusReq(created.id);
                              toast(`Deliverable added across ${phaseKeys.length} phases`);
                            },
                            onError: () => toast('Deliverable added, but failed to set the extra phases'),
                          },
                        );
                      } else {
                        st.getState().setFocusReq(fresh.id);
                        toast('Deliverable added');
                      }
                    },
                    onError: () => toast('Failed to add'),
                  },
                );
              }}
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
