import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { WorkflowHeader } from '@/components/workflow/WorkflowHeader';
import { Canvas } from '@/components/canvas/Canvas';
import { DeliverableDialog } from '@/components/dialogs/DeliverableDialog';
import { IncomingDeliverableDialog } from '@/components/dialogs/IncomingDeliverableDialog';
import { HldReleaseDialog } from '@/components/dialogs/HldReleaseDialog';
import { PhaseInfoDialog } from '@/components/dialogs/PhaseInfoDialog';
import { WorkflowSettingsDialog } from '@/components/dialogs/WorkflowSettingsDialog';
import { AddDeliverableDialog } from '@/components/dialogs/AddDeliverableDialog';
import { NoteDialog } from '@/components/dialogs/NoteDialog';
import { Toast } from '@/components/common/Toast';
import {
  useProjectWorkflowDirectory, useProjectWorkflows, useProjectMilestones, useProjects,
} from '@/api/hooks/useProjects';
import {
  useAddOwner, useAddViewGrant, useWorkflow, useRemoveOwner, useRemoveViewGrant, useUpdateWorkflow,
  useUpdateWorkflowPhases,
} from '@/api/hooks/useWorkflow';
import {
  useAddVersion, useCreateDeliverable, useDeleteDeliverable, useDeliverables, useRelease,
  useUpdateDeliverable, useUpdateRecv, useUpdateSchedule,
} from '@/api/hooks/useDeliverables';
import { useMemos } from '@/api/hooks/useMemos';
import { useEdges } from '@/api/hooks/useEdges';
import { useHldReleases } from '@/api/hooks/useHld';
import { usePutCanvas } from '@/api/hooks/useCanvas';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/app/providers/AuthProvider';
import { toast } from '@/store/toastStore';
import { countOrphans, placeIncomingNodes, placeInLane, toCanvasEdge, toCanvasMemo, toCanvasNode } from '@/lib/canvasModel';
import { DeliverableDto, WorkflowPhase } from '@/types/domain';
import { T } from '@/theme/tokens';
import { canEditWorkflow } from '@/lib/access';

export function BoardPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const navigate = useNavigate();
  const { user: me, isAdmin } = useAuth();

  const { data: projects } = useProjects();
  /** 과제 공통 일정 — 캔버스는 쓰지 않고, "과제 일정으로 되돌리기"에만 필요하다. */
  const { data: milestones } = useProjectMilestones(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const { data: workflowDirectory } = useProjectWorkflowDirectory(projectId);
  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: deliverablesResp } = useDeliverables(workflowId);
  const deliverables = deliverablesResp?.data;
  const incoming = useMemo(() => deliverablesResp?.incoming ?? [], [deliverablesResp]);
  const { data: memos } = useMemos(workflowId);
  const { data: edges } = useEdges(workflowId);
  const { data: hlds } = useHldReleases(workflowId);

  const st = useCanvasStore;
  const edit = useCanvasStore((s) => s.edit);
  const recv = useCanvasStore((s) => s.recv);
  const nodes = useCanvasStore((s) => s.nodes);
  const canvasMemos = useCanvasStore((s) => s.memos);
  const openId = useCanvasStore((s) => s.openId);
  const noteDlg = useCanvasStore((s) => s.noteDlg);
  const addDlg = useCanvasStore((s) => s.addDlg);
  const addDlgIntent = useCanvasStore((s) => s.addDlgIntent);
  const hldDlg = useCanvasStore((s) => s.hldDlg);
  const hldSel = useCanvasStore((s) => s.hldSel);
  const hldBack = useCanvasStore((s) => s.hldBack);
  const phInfo = useCanvasStore((s) => s.phInfo);
  const workflowSettingsTab = useCanvasStore((s) => s.workflowSettingsTab);
  const incomingId = useCanvasStore((s) => s.incomingId);

  const putCanvas = usePutCanvas(workflowId ?? '');
  const updateWorkflow = useUpdateWorkflow(workflowId ?? '');
  const [detailsErr, setDetailsErr] = useState<string | null>(null);
  const updatePhases = useUpdateWorkflowPhases(workflowId ?? '');
  const [phasesErr, setPhasesErr] = useState<string | null>(null);
  const createDeliverable = useCreateDeliverable(workflowId ?? '');
  const updateDeliverable = useUpdateDeliverable(workflowId ?? '');
  const deleteDeliverable = useDeleteDeliverable(workflowId ?? '');
  const updateRecv = useUpdateRecv(workflowId ?? '');
  const updateSchedule = useUpdateSchedule(workflowId ?? '');
  const addVersion = useAddVersion(workflowId ?? '');
  const release = useRelease(workflowId ?? '');
  const addOwner = useAddOwner(workflowId ?? '');
  const removeOwner = useRemoveOwner(workflowId ?? '');
  const addViewGrant = useAddViewGrant(workflowId ?? '');
  const removeViewGrant = useRemoveViewGrant(workflowId ?? '');

  /**
   * 서버 데이터 → 캔버스 작업 모델 (편집 중에는 덮어쓰지 않는다).
   * own(이 IP가 주는 산출물)과 incoming(다른 IP로부터 받는 산출물)을 하나의 nodes
   * 배열로 합쳐서 같은 캔버스 위에 그린다 — incoming은 origin==='incoming'으로
   * 표시돼 UI만 구분되고(점선 테두리 등), 그 외에는 own 노드와 똑같이 edge로 자유롭게
   * 연결할 수 있어 "받아서 → 내가 작업해서 → 다음으로 넘긴다"는 흐름이 한 캔버스에
   * 이어져 보인다. incoming은 이 workflow 소유가 아니라 위치를 저장할 곳이 없으므로,
   * hydrate 직후 placeIncomingNodes로 own 노드와 겹치지 않는 자리에 매번 다시 배치한다.
   */
  useEffect(() => {
    if (!workflowId || !deliverables || !memos || !edges) return;
    if (st.getState().edit) return;
    st.getState().hydrate(workflowId, {
      nodes: [
        ...deliverables.map((d) => toCanvasNode(d, 'own')),
        ...incoming.map((d) => toCanvasNode(d, 'incoming')),
      ],
      memos: memos.map(toCanvasMemo),
      edges: edges.map(toCanvasEdge),
      phaseWidths: workflow?.phaseWidths,
    });
    const s = st.getState();
    placeIncomingNodes(s.nodes, workflow?.phases ?? [], s.phasePW);
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
  }, [workflowId, deliverables, incoming, memos, edges, workflow?.phases, workflow?.phaseWidths, st]);

  /**
   * 편집 모드로 둔 채 이 페이지를 떠나면(다른 workflow로 이동 포함) 캔버스 편집 상태가
   * zustand 전역 store에 그대로 남아 있어, 저장하지 않고 나갔다가 다시 들어와도 계속
   * "편집 중"으로 보이는 버그가 있었다 — canvasStore는 컴포넌트가 언마운트돼도 초기화되지
   * 않는 모듈 상태이기 때문이다. 페이지를 떠날 때(=이 effect가 정리될 때) 편집 중이면
   * 미저장 변경을 취소하고 편집 모드를 강제로 끈다. 나중에 들어올 동시수정 방지 기능도
   * 이 지점(페이지 이탈 = 편집 세션 종료)에 편집 잠금 해제를 걸면 된다.
   */
  useEffect(() => {
    return () => {
      if (useCanvasStore.getState().edit) useCanvasStore.getState().cancelEdit();
    };
  }, [workflowId]);

  const isOwner = canEditWorkflow(workflow, isAdmin); // Admin(Group==='Admin')은 owner가 아니어도 편집 가능
  const canEdit = !!isOwner && !recv; // 목업 canEd()
  const own = !!isOwner && !recv; // 목업 own = isOwn(workflow) && !S.recv

  const openNode = useMemo(() => nodes.find((n) => n.id === openId) ?? null, [nodes, openId]);
  const incomingNode = useMemo(() => incoming.find((d) => d.id === incomingId) ?? null, [incoming, incomingId]);
  /** 캔버스가 쓰는 일정은 오직 이 workflow의 phase다 — 과제 마일스톤이 아니다. */
  const phaseList = useMemo(() => workflow?.phases ?? [], [workflow?.phases]);
  const orphanCount = useMemo(() => countOrphans(nodes, phaseList), [nodes, phaseList]);

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
        // origin==='incoming'은 다른 workflow 소유라 이 IP의 캔버스 저장 대상이 아니다.
        deliverables: s.nodes
          .filter((n) => n.origin !== 'incoming')
          .map((n) => ({
            id: n.id,
            layout: { x: n.x, y: n.y, w: n.w, h: n.h },
            phaseId: n.phase,
          })),
        memos: s.memos.map((m) => ({
          phaseId: m.phase,
          text: m.text,
          layout: { x: m.x, y: m.y, w: m.w, h: m.h },
        })),
        edges: s.edges.map((e) => ({
          fromId: e.from,
          toId: e.to,
          bidirectional: e.bidirectional,
          auto: e.auto,
        })),
        phaseWidths: s.phasePW,
      },
      {
        onSuccess: () => { toast('Layout saved'); onSettled?.(); },
        onError: () => { toast('Save failed'); onSettled?.(); },
      },
    );
  };

  /**
   * "Cancel changes" — 이번 편집 세션 중 새로 추가된 산출물(sessionAddedDeliverableIds)은
   * 이미 서버에 POST되어 있어 로컬 스냅샷 복원만으로는 취소되지 않는다. 실제로 삭제한
   * 뒤에야 cancelEdit()으로 나머지(레이아웃/메모/엣지)를 스냅샷으로 되돌린다.
   */
  const handleCancelEdit = (sessionAddedDeliverableIds: string[]) => {
    const finish = () => {
      st.getState().cancelEdit();
      toast('Changes cancelled');
    };
    if (!sessionAddedDeliverableIds.length) {
      finish();
      return;
    }
    Promise.allSettled(sessionAddedDeliverableIds.map((id) => deleteDeliverable.mutateAsync(id))).then(finish);
  };

  /**
   * 산출물 생성/Release 일정(series) 변경 결과를 로컬 캔버스에 즉시 반영한다.
   * `useDeliverables` 쿼리는 편집 중엔 disabled라 invalidate만으로는 화면에 나타나지
   * 않는다(설계서 7.1) — 그래서 응답으로 받은 DTO를 직접 store에 병합한다.
   * 이미 로컬에 있던 노드는 위치/크기(x,y,w,h,phase)를 보존하고 메타데이터만 갱신하고,
   * 새로 생긴 노드만 해당 Phase 레인 안쪽으로 배치한다(placeInLane) — 그렇지 않으면
   * 서버 기본 좌표(0,0)가 그대로 쓰여 phase 라벨과 실제 표시 위치가 어긋난다.
   */
  const mergeDeliverableResults = (list: DeliverableDto[], phaseListForPlacement: WorkflowPhase[]) => {
    const s = st.getState();
    const existingById = new Map(s.nodes.map((n) => [n.id, n]));
    const touched = list.map((d) => {
      const local = existingById.get(d.id);
      if (local) {
        return {
          ...local,
          name: d.name,
          artifactKey: d.artifactKey,
          type: d.docType,
          net: d.network,
          series: d.series,
          seriesIdx: d.seriesIdx,
          seriesTotal: d.seriesTotal,
          recvDept: d.recvDept,
          recvContact: d.recvContact,
          recvWorkflowId: d.recvWorkflowId,
          sourceDept: d.sourceDept,
          sourceContact: d.sourceContact,
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

  if (workflowLoading) {
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
      workflows={workflows ?? []}
      workflowId={workflowId}
      onChangeIp={(id) => navigate(`/details/${projectId}/${id}`)}
      canToggleRecv={!!isOwner}
    >
      {!workflow ? (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>
              No viewable workflow
            </Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              {me?.Name || me?.KnoxID} has no access to this project's Analog workflows.
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          <WorkflowHeader
            workflow={workflow}
            recv={recv}
            orphanCount={orphanCount}
            onOpenHld={() => st.getState().setHldDlg(true, null)}
            onOpenSettings={() => {
              setDetailsErr(null); setPhasesErr(null);
              // WorkflowSettingsDialog의 Details/Schedule 탭 노출 기준(own prop)과 맞춘다 —
              // 그쪽은 recv 미리보기 토글과 무관하게 isOwner만 본다(권한 관리 다이얼로그의
              // 기존 동작을 그대로 이어받음).
              st.getState().setWorkflowSettingsTab(isOwner ? 'details' : 'permissions');
            }}
          />
          <Canvas
            workflow={workflow}
            phases={phaseList}
            canEdit={canEdit}
            onOpenIncoming={(id) => st.getState().setIncomingId(id)}
            workflowDirectory={workflowDirectory ?? []}
            onSaveLayout={saveLayout}
            onCancelEdit={handleCancelEdit}
          />

          {openNode && (
            <DeliverableDialog
              node={openNode}
              phases={phaseList}
              own={own}
              onClose={closeDeliverable}
              onSaveInfo={({ name, artifactKey, net, type, phaseIds }) => {
                updateDeliverable.mutate(
                  { id: openNode.id, name, artifactKey: artifactKey ?? '', docType: type, network: net },
                  {
                    onSuccess: (updated) => {
                      mergeDeliverableResults([updated], phaseList);
                      const sid = openNode.series || openNode.id;
                      const before = nodes.filter((x) => (x.series || x.id) === sid).map((x) => x.phase).sort().join(',');
                      const after = [...phaseIds].sort().join(',');
                      if (before !== after) {
                        updateSchedule.mutate(
                          { id: sid, phaseIds },
                          {
                            onSuccess: (list) => {
                              mergeDeliverableResults(list, phaseList);
                              toast(`Release schedule: ${phaseIds.length} phase(s)`);
                            },
                            onError: () => toast('Failed to update release schedule'),
                          },
                        );
                      } else {
                        toast('Saved');
                      }
                      closeDeliverable();
                    },
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Save failed'),
                  },
                );
              }}
              onUpload={({ file, note, net, type }) => {
                // TODO: OA 업로드는 2단계 플로우여야 한다 —
                //   1) POST /deliverables/:id/upload (multipart/form-data, 파일 필드명 "file")
                //      → { data: { storageKey, fileName } }   (api/hooks/useDeliverables.ts의 useUploadFile)
                //   2) POST /deliverables/:id/versions 에 그 storageKey/fileName 전달
                // 지금은 DeliverableDialog의 업로드 UI가 실제 <input type="file">이 아니라
                // "파일 이름 문자열" 입력이라 보낼 File 객체가 없다. 파일 선택 UI가 생기면
                // useUploadFile()을 먼저 호출하고 그 응답의 storageKey로 아래 addVersion을
                // 호출하도록 바꿀 것. (HPC는 hpcPath만 쓰므로 그대로 둔다.)
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
                    // useDeliverables 쿼리는 편집 중엔 disabled라, 응답을 직접 store에
                    // 병합하지 않으면 "받은 산출물" 캔버스 배지(보라색 표시)가 편집을
                    // 끝내기 전까지 안 나타난다 — 방금 추가한 걸 저장해도 구별이 안 되는
                    // 버그였다.
                    onSuccess: (updated) => {
                      mergeDeliverableResults([updated], phaseList);
                      toast('Handoff info saved');
                    },
                    onError: () => toast('Failed to save recipient department'),
                  },
                )
              }
              onDelete={() => {
                deleteDeliverable.mutate(openNode.id, {
                  onSuccess: () => {
                    const s = st.getState();
                    s.setNodes(s.nodes.filter((n) => n.id !== openNode.id));
                    s.setEdges(s.edges.filter((e) => e.from !== openNode.id && e.to !== openNode.id));
                    closeDeliverable();
                    toast('Artifact deleted');
                  },
                  onError: () => toast('Failed to delete artifact'),
                });
              }}
            />
          )}

          {incomingNode && (
            <IncomingDeliverableDialog
              d={incomingNode}
              onClose={() => st.getState().setIncomingId(null)}
            />
          )}

          {hldDlg && (
            <HldReleaseDialog
              workflowName={workflow.name}
              releases={hlds ?? []}
              nodes={nodes}
              phases={phaseList}
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

          {phInfo && phaseList.find((p) => p.id === phInfo) && (
            <PhaseInfoDialog
              workflowName={workflow.name}
              phase={phaseList.find((p) => p.id === phInfo)!}
              nodes={nodes}
              onClose={() => st.getState().setPhInfo(null)}
              onOpenRow={(id) => {
                st.getState().setPhInfo(null);
                st.getState().openDeliverable(id);
              }}
            />
          )}

          {workflowSettingsTab && (
            <WorkflowSettingsDialog
              workflow={workflow}
              own={!!isOwner}
              initialTab={workflowSettingsTab}
              milestones={milestones ?? []}
              orphanCount={orphanCount}
              onClose={() => st.getState().setWorkflowSettingsTab(null)}
              onSaveDetails={({ name, description }) => {
                setDetailsErr(null);
                updateWorkflow.mutate({ name, description }, {
                  onError: (e: any) => setDetailsErr(e?.response?.data?.message ?? 'Failed to save'),
                });
              }}
              savingDetails={updateWorkflow.isPending}
              detailsError={detailsErr}
              onSavePhases={(next) => {
                setPhasesErr(null);
                updatePhases.mutate(next, {
                  onSuccess: (updated) => {
                    // 레인 폭은 phase id 기준이라, 없어진 phase의 폭이 남아 있어도 무해하다.
                    // 대신 유실이 새로 생겼는지 바로 알려 준다.
                    const lost = countOrphans(st.getState().nodes, updated.phases);
                    toast(
                      lost > 0
                        ? `Schedule updated — ${lost} artifact(s) now have no release schedule`
                        : 'Schedule updated',
                    );
                  },
                  onError: (e: any) => setPhasesErr(e?.response?.data?.message ?? 'Failed to save'),
                });
              }}
              savingPhases={updatePhases.isPending}
              phasesError={phasesErr}
              onAddOwner={(knoxId, department) =>
                addOwner.mutate({ knoxId, department }, {
                  onSuccess: () => toast('Edit access added'),
                  onError: (e: any) =>
                    toast(e?.response?.data?.message ?? 'Failed to add'),
                })
              }
              onRemoveOwner={(knoxId) => removeOwner.mutate(knoxId)}
              onAddViewGrant={(knoxId, department) =>
                addViewGrant.mutate({ knoxId, department }, { onSuccess: () => toast('View access added') })
              }
              onRemoveViewGrant={(knoxId) => removeViewGrant.mutate(knoxId)}
            />
          )}

          {addDlg && (
            <AddDeliverableDialog
              workflowName={workflow.name}
              phases={phaseList}
              intent={addDlgIntent}
              onClose={() => st.getState().setAddDlg(false)}
              onCreate={({ name, phaseIds, docType, network }) => {
                const [firstPhase, ...rest] = phaseIds;
                const wasReceived = addDlgIntent === 'received';
                const intent = wasReceived ? 'received' : 'own';
                createDeliverable.mutate(
                  { name, phaseId: firstPhase, docType, network, intent },
                  {
                    onSuccess: (created) => {
                      const s = st.getState();
                      const fresh = toCanvasNode(created);
                      placeInLane(fresh, phaseList, s.phasePW);
                      s.setNodes([...s.nodes, fresh]);
                      st.getState().setAddDlg(false);
                      // 이번 편집 세션 중 새로 생겼다고 기록 — Cancel 시 실제로 삭제해야
                      // "추가를 취소"한 게 된다(canvasStore.sessionAddedDeliverableIds).
                      st.getState().trackAddedDeliverable(created.id);
                      // "받아야 할 산출물"로 추가한 경우, 바로 상세를 열어 기본 정보를 채우도록
                      // 유도한다 — 전달(Handoff) 탭은 이제 없으므로 개요 탭으로 연다.
                      if (wasReceived) st.getState().openDeliverable(fresh.id);
                      if (rest.length) {
                        updateSchedule.mutate(
                          { id: created.id, phaseIds },
                          {
                            onSuccess: (list) => {
                              mergeDeliverableResults(list, phaseList);
                              list.forEach((d) => st.getState().trackAddedDeliverable(d.id));
                              if (!wasReceived) st.getState().setFocusReq(created.id);
                              toast(`Deliverable added across ${phaseIds.length} phases`);
                            },
                            onError: () => toast('Deliverable added, but failed to set the extra phases'),
                          },
                        );
                      } else {
                        if (!wasReceived) st.getState().setFocusReq(fresh.id);
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
