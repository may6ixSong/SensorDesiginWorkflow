import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/layout/AppShell';
import { WorkflowHeader } from '@/components/workflow/WorkflowHeader';
import { Canvas } from '@/components/canvas/Canvas';
import { ArtifactListView } from '@/components/list/ArtifactListView';
import { ArtifactSlide } from '@/components/dialogs/ArtifactSlide';
import { RecipientMatrixDialog } from '@/components/dialogs/RecipientMatrixDialog';
import { PhaseInfoDialog } from '@/components/dialogs/PhaseInfoDialog';
import { WorkflowSettingsDialog } from '@/components/dialogs/WorkflowSettingsDialog';
import { AddArtifactDialog } from '@/components/dialogs/AddArtifactDialog';
import { NoteDialog } from '@/components/dialogs/NoteDialog';
import { ReleaseDialog } from '@/components/release/ReleaseDialog';
import { Toast } from '@/components/common/Toast';
import { queryKeys } from '@/api/queryKeys';
import { useProject, useProjectWorkflows, useProjectMilestones, useProjects } from '@/api/hooks/useProjects';
import { useUpdateWorkflow, useReplaceWorkflowAccess, useWorkflow, useUpdateWorkflowPhases } from '@/api/hooks/useWorkflow';
import {
  NewArtifactSourceInput, useNodes, useCreateNode, useDeleteNode, useReplaceNodeRecipients, useUpdateNode,
} from '@/api/hooks/useNodes';
import { useCreateRelease, useReleasePreview, useReleases } from '@/api/hooks/useReleases';
import { useMemos } from '@/api/hooks/useMemos';
import { useEdges } from '@/api/hooks/useEdges';
import { usePutCanvas } from '@/api/hooks/useCanvas';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/app/providers/AuthProvider';
import { toast } from '@/store/toastStore';
import { placeInLane, toCanvasEdge, toCanvasMemo, toCanvasNode } from '@/lib/canvasModel';
import { NH, NW } from '@/lib/constants';
import { getViewMode, setViewMode, ViewMode } from '@/lib/viewMode';
import { T } from '@/theme/tokens';
import { canEditWorkflow, myDepartments as myDeptsOf } from '@/lib/access';
import { ArtifactIntent, NodeDto, WorkflowDto, WorkflowPhase } from '@/types/domain';

const countOrphanNodes = (nodes: NodeDto[], phases: WorkflowPhase[]) =>
  nodes.filter((n) => !phases.some((p) => p.id === n.phaseId)).length;

/**
 * workflow 화면 — canvas view와 list view가 공유하는 하나의 페이지(사용자 요청).
 * 공통 컴포넌트(헤더 + 모든 dialog)는 여기서 한 번만 그리고, 그 아래 본문만
 * view mode에 따라 <Canvas>(canvas view) 또는 <ArtifactListView>(list view, 예전
 * Release 이력 페이지를 대체)로 바뀐다. view는 쿠키에 기억돼 다음 접속에도 이어진다.
 *
 * 라우트 3개가 전부 이 컴포넌트로 온다:
 *   /details/:projectId/:workflowId                    — canvas 또는(쿠키가 list면) list로 즉시 리다이렉트
 *   /details/:projectId/:workflowId/releases            — list, release 미지정(정규화됨)
 *   /details/:projectId/:workflowId/releases/:releaseId — list, 특정 release(또는 'current')
 */
export function WorkflowPage() {
  const { projectId, workflowId, releaseId } = useParams<{ projectId: string; workflowId: string; releaseId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user: me, isAdmin } = useAuth();
  const qc = useQueryClient();

  const isListPath = location.pathname.includes('/releases');
  const mode: ViewMode = isListPath ? 'list' : 'canvas';
  /**
   * base 경로인데 쿠키가 list를 가리키면, 아래 effect가 리다이렉트하기 전까지 canvas를
   * 잠깐이라도 마운트하지 않는다 — Canvas가 뜨면 memos/edges까지 fetch되고 화면이
   * 한 프레임 깜빡이기 때문이다. 쿠키 읽기는 순수 조회라 렌더 중에 불러도 안전하다.
   */
  const pendingCookieRedirect = !isListPath && getViewMode() === 'list';

  const { data: projects } = useProjects();
  const { data: project } = useProject(projectId);
  const { data: milestones } = useProjectMilestones(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: nodes } = useNodes(workflowId);
  const releases = useReleases(workflowId);

  const canEdit = canEditWorkflow(workflow, isAdmin);

  /** list view의 "Current"용 — edit 권한자에게 늘 켜 둔다(예전 Release 이력 페이지와 동일).
   * canvas만 보는 사람에게는 이 라이브 조회를 굳이 태우지 않는다. */
  const preview = useReleasePreview(workflowId, mode === 'list' && canEdit);
  const previewForbidden = preview.isError && (preview.error as any)?.response?.status === 403;
  const canShowCurrent = canEdit && !previewForbidden;

  const st = useCanvasStore;
  const openId = useCanvasStore((s) => s.openId);
  const openInitialTab = useCanvasStore((s) => s.openInitialTab);
  const addDlg = useCanvasStore((s) => s.addDlg);
  const workflowSettingsTab = useCanvasStore((s) => s.workflowSettingsTab);

  const updateWorkflow = useUpdateWorkflow(workflowId ?? '');
  const replaceAccess = useReplaceWorkflowAccess(workflowId ?? '');
  const updatePhases = useUpdateWorkflowPhases(workflowId ?? '');
  const createNode = useCreateNode(workflowId ?? '');
  const updateNode = useUpdateNode(workflowId ?? '');
  const deleteNode = useDeleteNode(workflowId ?? '');
  const replaceRecipients = useReplaceNodeRecipients(workflowId ?? '');
  const createRelease = useCreateRelease(workflowId ?? '');

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [phasesErr, setPhasesErr] = useState<string | null>(null);
  /** 수신 부서 필터 — canvas에서는 흐리게, list에서는 숨긴다(사용자 요청, 공통 컨트롤이지만
   * 화면마다 적용 방식은 다르다). */
  const [recipientFilter, setRecipientFilter] = useState<string[]>([]);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [recipientMatrixOpen, setRecipientMatrixOpen] = useState(false);

  /** Release 다이얼로그 전용 — 열려 있을 때만 라이브로 조회한다(설계서 05장 §4.4). */
  const releasePreview = useReleasePreview(workflowId, releaseOpen);

  const myDepartments = useMemo(
    () => myDeptsOf(project, me?.KnoxID, isAdmin),
    [project, me?.KnoxID, isAdmin],
  );

  // 진입 시 cookie에 저장된 마지막 view로 보정한다 — base 경로(=canvas 자리)로 들어왔는데
  // 마지막으로 본 게 list였으면 곧장 list로 보낸다. list 경로로 들어오면 그 자체가 이제
  // "마지막으로 본 view"이므로 쿠키를 list로 맞춘다(사용자 요청 — 다음 접속도 그대로).
  useEffect(() => {
    if (!projectId || !workflowId) return;
    if (isListPath) { setViewMode('list'); return; }
    if (getViewMode() === 'list') {
      navigate(`/details/${projectId}/${workflowId}/releases`, { replace: true });
      return;
    }
    setViewMode('canvas');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListPath, projectId, workflowId]);

  const switchView = (next: ViewMode) => {
    if (next === mode || !projectId || !workflowId) return;
    setViewMode(next);
    navigate(next === 'list' ? `/details/${projectId}/${workflowId}/releases` : `/details/${projectId}/${workflowId}`);
  };

  const phaseList = useMemo(() => workflow?.phases ?? [], [workflow?.phases]);
  const orphanCount = useMemo(() => countOrphanNodes(nodes ?? [], phaseList), [nodes, phaseList]);

  const openNode = useMemo(() => (nodes ?? []).find((n) => n.id === openId) ?? null, [nodes, openId]);
  const closeSlide = () => st.getState().openDeliverable(null);

  // ── list view 전용 release 선택 상태 (예전 ReleaseHistoryPage) ──
  const sortedReleases = useMemo(() => [...(releases.data ?? [])].sort((a, b) => b.seq - a.seq), [releases.data]);
  const requestedCurrent = releaseId === 'current';
  const showCurrent = mode === 'list' && requestedCurrent && canShowCurrent;
  const selectedRelease = mode === 'list' && !showCurrent && releaseId && releaseId !== 'current'
    ? sortedReleases.find((r) => r.id === releaseId) ?? null
    : null;

  useEffect(() => {
    if (mode !== 'list' || releaseId || !projectId || !workflowId) return;
    if (canEdit) navigate(`/details/${projectId}/${workflowId}/releases/current`, { replace: true });
    else if (sortedReleases.length > 0) navigate(`/details/${projectId}/${workflowId}/releases/${sortedReleases[0].id}`, { replace: true });
  }, [mode, releaseId, sortedReleases, projectId, workflowId, canEdit, navigate]);

  useEffect(() => {
    if (mode !== 'list' || !requestedCurrent || canShowCurrent || !projectId || !workflowId) return;
    if (sortedReleases.length > 0) navigate(`/details/${projectId}/${workflowId}/releases/${sortedReleases[0].id}`, { replace: true });
    else navigate(`/details/${projectId}/${workflowId}/releases`, { replace: true });
  }, [mode, requestedCurrent, canShowCurrent, sortedReleases, projectId, workflowId, navigate]);

  /**
   * 새 artifact(node) 생성 — canvas/list 둘 다 여기 하나로 모았다. y축은 그 Phase에 이미
   * 있는 node들과 절대 겹치지 않는 자리로 미리 계산해서, 그 좌표를 그대로 생성 요청에
   * 실어 보낸다(사용자 요청) — list view는 편집 세션/저장 개념이 없어 즉시 확정돼야 한다.
   * canvas view에서 편집 세션 중에 추가한 경우엔 취소 시 삭제할 수 있도록 계속 추적한다.
   */
  const handleCreateArtifact = ({ name, phaseId, intent, newArtifact }: {
    name: string; phaseId: string; intent: ArtifactIntent; newArtifact?: NewArtifactSourceInput;
  }) => {
    if (!workflow) return;
    const seed = { x: 0, y: 0, phase: phaseId };
    placeInLane(seed, phaseList, workflow.phaseWidths ?? {}, (nodes ?? []).map(toCanvasNode));
    createNode.mutate(
      { name, phaseId, intent, newArtifact, layout: { x: seed.x, y: seed.y, w: NW, h: NH } },
      {
        onSuccess: (created) => {
          if (mode === 'canvas') {
            const s = st.getState();
            const fresh = toCanvasNode(created);
            s.setNodes([...s.nodes, fresh]);
            s.trackAddedDeliverable(created.id);
            s.setFocusReq(fresh.id);
          }
          // list view의 "Current"는 매핑된 항목을 release preview에서 읽는다 — 방금 만든
          // node가 artifact까지 매핑됐다면 그 계산도 새로 해야 한다.
          qc.invalidateQueries({ queryKey: queryKeys.releasePreview(workflowId ?? '') });
          st.getState().setAddDlg(false);
          toast('Artifact added');
        },
        onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to add'),
      },
    );
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
    >
      {!workflow ? (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>
              {t('project.noWorkflowAccess')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              {me?.Name || me?.KnoxID}
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          <WorkflowHeader
            workflow={workflow}
            orphanCount={orphanCount}
            canEdit={canEdit}
            departmentOptions={project?.departments ?? []}
            recipientFilter={recipientFilter}
            onChangeRecipientFilter={setRecipientFilter}
            onOpenSettings={() => {
              setSaveErr(null); setPhasesErr(null);
              st.getState().setWorkflowSettingsTab('details');
            }}
            onOpenRelease={() => setReleaseOpen(true)}
            viewMode={pendingCookieRedirect ? 'list' : mode}
            onChangeViewMode={switchView}
            onOpenRecipientMatrix={canEdit ? () => setRecipientMatrixOpen(true) : undefined}
          />

          {pendingCookieRedirect ? (
            <Box sx={{ flex: 1 }} />
          ) : mode === 'canvas' ? (
            <CanvasBody
              workflow={workflow}
              phaseList={phaseList}
              canEdit={canEdit}
              recipientFilter={recipientFilter}
              nodes={nodes ?? []}
              deleteNode={deleteNode}
            />
          ) : (
            <ArtifactListView
              workflow={workflow}
              nodes={nodes ?? []}
              sortedReleases={sortedReleases}
              selected={selectedRelease}
              showCurrent={showCurrent}
              canShowCurrent={canShowCurrent}
              previewItems={preview.data?.items ?? []}
              previewChangedCount={preview.data?.changedCount ?? 0}
              recipientFilter={recipientFilter}
              canEdit={canEdit}
              workflowId={workflowId ?? ''}
              onSelectRelease={(rid) => navigate(`/details/${projectId}/${workflowId}/releases/${rid}`)}
              onSelectCurrent={() => navigate(`/details/${projectId}/${workflowId}/releases/current`)}
              onOpenArtifact={(id, tab) => st.getState().openDeliverable(id, tab)}
              onAddArtifact={() => st.getState().setAddDlg(true, 'own')}
            />
          )}

          {openNode && (
            <ArtifactSlide
              node={openNode}
              own={canEdit}
              project={project}
              myDepartments={myDepartments}
              phases={phaseList}
              onClose={closeSlide}
              initialTab={openInitialTab ?? undefined}
              onChangeArtifact={(newArtifact) =>
                updateNode.mutate(
                  { id: openNode.id, newArtifact },
                  {
                    onSuccess: () => toast('Artifact changed'),
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to change artifact'),
                  },
                )
              }
              changingArtifact={updateNode.isPending}
              releases={releases.data ?? []}
              onOpenRelease={(rid) => {
                closeSlide();
                navigate(`/details/${projectId}/${workflowId}/releases/${rid}`);
              }}
              saving={replaceRecipients.isPending}
              onSaveRecipients={(p) =>
                replaceRecipients.mutate(
                  { nodeId: openNode.id, ...p },
                  {
                    onSuccess: () => toast('Recipients saved'),
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save recipients'),
                  },
                )
              }
              onDelete={
                canEdit
                  ? () =>
                      deleteNode.mutate(openNode.id, {
                        onSuccess: () => {
                          const s = st.getState();
                          s.setNodes(s.nodes.filter((n) => n.id !== openNode.id));
                          s.setEdges(s.edges.filter((e) => e.from !== openNode.id && e.to !== openNode.id));
                          closeSlide();
                          if (s.sel === openNode.id || s.hlSet) s.select(null, null);
                          toast('Removed from canvas');
                        },
                        onError: () => toast('Failed to remove'),
                      })
                  : undefined
              }
            />
          )}

          {workflowSettingsTab && (
            <WorkflowSettingsDialog
              workflow={workflow}
              own={canEdit}
              initialTab={workflowSettingsTab}
              milestones={milestones ?? []}
              orphanCount={orphanCount}
              onClose={() => st.getState().setWorkflowSettingsTab(null)}
              myDepartments={myDepartments}
              departmentOptions={project?.departments ?? []}
              onSave={({ name, description, department }) => {
                setSaveErr(null);
                updateWorkflow.mutate(
                  { name, description, department },
                  {
                    onSuccess: (updated) => {
                      toast(
                        updated.department !== workflow.department
                          ? `Moved to ${
                            project?.departments.find((d) => d.id === updated.department)?.name
                              ?? updated.department
                          }`
                          : 'Saved',
                      );
                    },
                    onError: (e: any) => setSaveErr(e?.response?.data?.message ?? 'Failed to save'),
                  },
                );
              }}
              saving={updateWorkflow.isPending}
              saveError={saveErr}
              onSaveAccess={(p) =>
                replaceAccess.mutate(p, {
                  onSuccess: () => toast('Permissions saved'),
                  onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save permissions'),
                })
              }
              savingAccess={replaceAccess.isPending}
              onSavePhases={(next) => {
                setPhasesErr(null);
                updatePhases.mutate(next, {
                  onSuccess: (updated) => {
                    const lost = countOrphanNodes(nodes ?? [], updated.phases);
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
            />
          )}

          {addDlg && (
            <AddArtifactDialog
              workflowName={workflow.name}
              workflowId={workflowId ?? ''}
              projectId={projectId}
              projectCode={project?.code}
              projectRevision={project?.revision}
              phases={phaseList}
              myDepartments={myDepartments}
              departmentOptions={project?.departments ?? []}
              onClose={() => st.getState().setAddDlg(false)}
              submitting={createNode.isPending}
              onCreate={handleCreateArtifact}
            />
          )}

          {recipientMatrixOpen && canEdit && (
            <RecipientMatrixDialog
              workflowId={workflowId ?? ''}
              nodes={nodes ?? []}
              phases={phaseList}
              departmentOptions={project?.departments ?? []}
              onClose={() => setRecipientMatrixOpen(false)}
            />
          )}

          {releaseOpen && (
            <ReleaseDialog
              workflowName={workflow.name}
              projectId={workflow.projectId}
              preview={releasePreview.data ?? null}
              loading={releasePreview.isLoading}
              saving={createRelease.isPending}
              onClose={() => setReleaseOpen(false)}
              onRelease={({ note, sources }) =>
                createRelease.mutate(
                  { note, sources },
                  {
                    onSuccess: (created) => {
                      setReleaseOpen(false);
                      toast(`Released ${created.label}`);
                    },
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Release failed'),
                  },
                )
              }
            />
          )}
        </>
      )}
      <Toast />
    </AppShell>
  );
}

/**
 * canvas view의 편집 상태(zustand nodes/memos/edges)는 이 하위 컴포넌트가 실제로
 * mount됐을 때만 필요하다 — list view만 보는 세션에서까지 memos/edges를 fetch하거나
 * canvasStore를 그 workflow로 hydrate할 이유가 없어 별도 컴포넌트로 뺐다.
 */
function CanvasBody({
  workflow, phaseList, canEdit, recipientFilter, nodes: nodeDtos, deleteNode,
}: {
  workflow: WorkflowDto;
  phaseList: WorkflowPhase[];
  canEdit: boolean;
  recipientFilter: string[];
  nodes: NodeDto[];
  deleteNode: ReturnType<typeof useDeleteNode>;
}) {
  const { t } = useTranslation();
  const workflowId = workflow.id;
  const st = useCanvasStore;
  const { data: memos } = useMemos(workflowId);
  const { data: edges } = useEdges(workflowId);
  const putCanvas = usePutCanvas(workflowId);

  useEffect(() => {
    if (st.getState().edit) return;
    if (!memos || !edges) return;
    st.getState().hydrate(workflowId, {
      nodes: nodeDtos.map(toCanvasNode),
      memos: memos.map(toCanvasMemo),
      edges: edges.map(toCanvasEdge),
      phaseWidths: workflow.phaseWidths,
    });
    st.getState().bumpNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, workflow, nodeDtos, memos, edges]);

  useEffect(() => {
    return () => {
      if (useCanvasStore.getState().edit) useCanvasStore.getState().cancelEdit();
    };
  }, [workflowId]);

  const nodes = useCanvasStore((s) => s.nodes);
  const canvasMemos = useCanvasStore((s) => s.memos);
  const phInfo = useCanvasStore((s) => s.phInfo);
  const noteDlg = useCanvasStore((s) => s.noteDlg);

  const saveLayout = (onSettled?: () => void) => {
    const s = st.getState();
    putCanvas.mutate(
      {
        nodes: s.nodes.map((n) => ({
          id: n.id,
          layout: { x: n.x, y: n.y, w: n.w, h: n.h },
          phaseId: n.phase,
        })),
        memos: s.memos.map((m) => ({
          phaseId: m.phase,
          text: m.text,
          color: m.color,
          layout: { x: m.x, y: m.y, w: m.w, h: m.h },
        })),
        edges: s.edges.map((e) => ({
          fromId: e.from,
          toId: e.to,
          bidirectional: e.bi,
          auto: e.auto,
        })),
        phaseWidths: s.phasePW,
      },
      {
        onSuccess: () => { toast('Layout saved'); onSettled?.(); },
        onError: (e: any) => {
          const status = e?.response?.status;
          toast(status === 409 ? t('canvas.lockExpired') : 'Save failed');
          onSettled?.();
        },
      },
    );
  };

  const handleCancelEdit = (sessionAddedIds: string[]) => {
    const finish = () => {
      st.getState().cancelEdit();
      toast('Changes cancelled');
    };
    if (!sessionAddedIds.length) { finish(); return; }
    Promise.allSettled(sessionAddedIds.map((id) => deleteNode.mutateAsync(id))).then(finish);
  };

  return (
    <>
      <Canvas
        workflow={workflow}
        phases={phaseList}
        canEdit={canEdit}
        recipientFilter={recipientFilter}
        onSaveLayout={saveLayout}
        onCancelEdit={handleCancelEdit}
      />

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

      {noteDlg && (
        <NoteDialog
          text={canvasMemos.find((m) => m.id === noteDlg)?.text ?? ''}
          color={canvasMemos.find((m) => m.id === noteDlg)?.color}
          onClose={() => st.getState().setNoteDlg(null)}
          onSave={(text, color) => {
            const s = st.getState();
            s.setMemos(s.memos.map((m) => (m.id === noteDlg ? { ...m, text, color } : m)));
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
  );
}
