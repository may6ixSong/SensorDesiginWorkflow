import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/layout/AppShell';
import { WorkflowHeader } from '@/components/workflow/WorkflowHeader';
import { Canvas } from '@/components/canvas/Canvas';
import { ArtifactSlide } from '@/components/dialogs/ArtifactSlide';
import { PhaseInfoDialog } from '@/components/dialogs/PhaseInfoDialog';
import { WorkflowSettingsDialog } from '@/components/dialogs/WorkflowSettingsDialog';
import { AddBlockDialog } from '@/components/dialogs/AddBlockDialog';
import { NoteDialog } from '@/components/dialogs/NoteDialog';
import { ReleaseDialog } from '@/components/release/ReleaseDialog';
import { ReleaseHistoryDialog } from '@/components/release/ReleaseHistoryDialog';
import { Toast } from '@/components/common/Toast';
import { useProject, useProjectWorkflows, useProjectMilestones, useProjects } from '@/api/hooks/useProjects';
import { useUpdateWorkflow, useReplaceWorkflowAccess, useWorkflow, useUpdateWorkflowPhases } from '@/api/hooks/useWorkflow';
import { useBlocks, useCreateBlock, useDeleteBlock, useReplaceBlockRecipients } from '@/api/hooks/useBlocks';
import { useReplaceArtifactAccess } from '@/api/hooks/useArtifacts';
import { useCreateRelease, useReleasePreview, useReleases } from '@/api/hooks/useReleases';
import { useMemos } from '@/api/hooks/useMemos';
import { useEdges } from '@/api/hooks/useEdges';
import { usePutCanvas } from '@/api/hooks/useCanvas';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/app/providers/AuthProvider';
import { toast } from '@/store/toastStore';
import { countOrphans, placeInLane, toCanvasEdge, toCanvasMemo, toCanvasNode } from '@/lib/canvasModel';
import { T } from '@/theme/tokens';
import { canEditWorkflow, myDepartments as myDeptsOf } from '@/lib/access';

export function BoardPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user: me, isAdmin } = useAuth();

  const { data: projects } = useProjects();
  const { data: project } = useProject(projectId);
  /** 과제 공통 일정 — 캔버스는 쓰지 않고, "과제 일정으로 되돌리기"에만 필요하다. */
  const { data: milestones } = useProjectMilestones(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: blocks } = useBlocks(workflowId);
  const { data: memos } = useMemos(workflowId);
  const { data: edges } = useEdges(workflowId);

  /**
   * 캔버스 편집 권한. 서버가 내려주는 myAccess에 Admin super 권한이 이미 반영되어 있지만,
   * 목록 화면과 판정 기준을 하나로 맞추려 같은 헬퍼를 쓴다.
   */
  const canEdit = canEditWorkflow(workflow, isAdmin);

  const st = useCanvasStore;
  const nodes = useCanvasStore((s) => s.nodes);
  const canvasMemos = useCanvasStore((s) => s.memos);
  const openId = useCanvasStore((s) => s.openId);
  const noteDlg = useCanvasStore((s) => s.noteDlg);
  const addDlg = useCanvasStore((s) => s.addDlg);
  const phInfo = useCanvasStore((s) => s.phInfo);
  const workflowSettingsTab = useCanvasStore((s) => s.workflowSettingsTab);

  const putCanvas = usePutCanvas(workflowId ?? '');
  const updateWorkflow = useUpdateWorkflow(workflowId ?? '');
  const replaceAccess = useReplaceWorkflowAccess(workflowId ?? '');
  const updatePhases = useUpdateWorkflowPhases(workflowId ?? '');
  const createBlock = useCreateBlock(workflowId ?? '');
  const deleteBlock = useDeleteBlock(workflowId ?? '');
  const replaceRecipients = useReplaceBlockRecipients(workflowId ?? '');
  const replaceArtifactAccess = useReplaceArtifactAccess(workflowId ?? '');

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [phasesErr, setPhasesErr] = useState<string | null>(null);
  /** 수신 부서 필터 — 걸린 블록은 흐려질 뿐 사라지지 않는다(설계서 03장 §6.1). */
  const [recipientFilter, setRecipientFilter] = useState<string[]>([]);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  /**
   * preview는 연동 서비스에 라이브로 버전을 물어보므로 평소 조회보다 느리다 —
   * 다이얼로그를 연 순간에만 부른다.
   */
  const releasePreview = useReleasePreview(workflowId, releaseOpen);
  const releases = useReleases(workflowId);
  const createRelease = useCreateRelease(workflowId ?? '');

  const myDepartments = useMemo(
    () => myDeptsOf(project, me?.KnoxID, isAdmin),
    [project, me?.KnoxID, isAdmin],
  );

  /**
   * 서버 데이터 → 캔버스 작업 모델 (편집 중에는 덮어쓰지 않는다).
   *
   * ★ Edit/View 권한자가 **완전히 동일한 캔버스**를 본다(설계서 03장 §1) — 예전처럼
   *   View 권한자에게만 release 스냅샷을 보여주는 분기가 없다. 캔버스에는 version 개념이
   *   아예 없어졌으므로 항상 지금 상태 하나뿐이다.
   */
  useEffect(() => {
    if (!workflowId || !workflow) return;
    if (st.getState().edit) return;
    if (!blocks || !memos || !edges) return;

    st.getState().hydrate(workflowId, {
      nodes: blocks.map(toCanvasNode),
      memos: memos.map(toCanvasMemo),
      edges: edges.map(toCanvasEdge),
      phaseWidths: workflow.phaseWidths,
    });
    st.getState().bumpBlocks();
  }, [workflowId, workflow, blocks, memos, edges, st]);

  /**
   * 편집 모드로 둔 채 이 페이지를 떠나면 캔버스 편집 상태가 zustand 전역 store에 그대로
   * 남아, 저장하지 않고 나갔다가 다시 들어와도 계속 "편집 중"으로 보인다 — canvasStore는
   * 언마운트돼도 초기화되지 않는 모듈 상태이기 때문이다. 떠날 때 편집 중이면 미저장
   * 변경을 취소한다.
   *
   * ★ 캔버스 lock 해제도 여기서 함께 일어나야 하지만, lock은 Canvas 컴포넌트가 편집 세션
   *   진입/종료와 함께 직접 관리한다(설계서 03장 §3.1의 "페이지 이탈 = 세션 종료").
   */
  useEffect(() => {
    return () => {
      if (useCanvasStore.getState().edit) useCanvasStore.getState().cancelEdit();
    };
  }, [workflowId]);

  const openBlock = useMemo(() => (blocks ?? []).find((b) => b.id === openId) ?? null, [blocks, openId]);
  /** 캔버스가 쓰는 일정은 오직 이 workflow의 phase다 — 과제 마일스톤이 아니다. */
  const phaseList = useMemo(() => workflow?.phases ?? [], [workflow?.phases]);
  const orphanCount = useMemo(() => countOrphans(nodes, phaseList), [nodes, phaseList]);

  const closeSlide = () => st.getState().openDeliverable(null);

  /**
   * 편집 종료 시 캔버스 일괄 저장. Canvas는 저장이 끝난 뒤(성공/실패 무관)에만 편집 모드를
   * 종료한다 — 그 전에 종료하면 disabled였던 조회 쿼리가 재활성화되며 아직 저장되지 않은
   * 로컬 편집 결과를 stale 서버 데이터로 덮어쓸 수 있다.
   *
   * ★ 이 PUT만이 canvasLock을 요구한다. lock이 만료됐거나 남이 들고 있으면 409가 온다.
   */
  const saveLayout = (onSettled?: () => void) => {
    const s = st.getState();
    putCanvas.mutate(
      {
        blocks: s.nodes.map((n) => ({
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
          bidirectional: e.bi,
          auto: e.auto,
        })),
        phaseWidths: s.phasePW,
      },
      {
        onSuccess: () => { toast('Layout saved'); onSettled?.(); },
        onError: (e: any) => {
          // 409 = 편집 세션 만료 또는 남이 점유 중. 그 사실을 그대로 알려 준다.
          const status = e?.response?.status;
          toast(status === 409 ? t('canvas.lockExpired') : 'Save failed');
          onSettled?.();
        },
      },
    );
  };

  /**
   * "변경 취소" — 이번 편집 세션 중 새로 추가된 블록은 이미 서버에 POST되어 있어 로컬
   * 스냅샷 복원만으로는 취소되지 않는다. 실제로 삭제한 뒤에야 나머지(레이아웃/메모/엣지)를
   * 스냅샷으로 되돌린다.
   */
  const handleCancelEdit = (sessionAddedIds: string[]) => {
    const finish = () => {
      st.getState().cancelEdit();
      toast('Changes cancelled');
    };
    if (!sessionAddedIds.length) { finish(); return; }
    Promise.allSettled(sessionAddedIds.map((id) => deleteBlock.mutateAsync(id))).then(finish);
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
            onOpenHistory={() => setHistoryOpen(true)}
          />

          <Canvas
            workflow={workflow}
            phases={phaseList}
            canEdit={canEdit}
            recipientFilter={recipientFilter}
            onSaveLayout={saveLayout}
            onCancelEdit={handleCancelEdit}
          />

          {openBlock && (
            <ArtifactSlide
              block={openBlock}
              own={canEdit}
              project={project}
              onClose={closeSlide}
              saving={replaceRecipients.isPending || replaceArtifactAccess.isPending}
              onSaveBlockRecipients={(p) =>
                replaceRecipients.mutate(
                  { blockId: openBlock.id, ...p },
                  {
                    onSuccess: () => toast('Recipients saved'),
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save recipients'),
                  },
                )
              }
              onSaveArtifactAccess={(p) => {
                if (!openBlock.artifactId) return;
                replaceArtifactAccess.mutate(
                  { artifactId: openBlock.artifactId, ...p },
                  {
                    onSuccess: () => toast('Access saved'),
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save access'),
                  },
                );
              }}
              onDelete={
                canEdit
                  ? () =>
                      deleteBlock.mutate(openBlock.id, {
                        onSuccess: () => {
                          const s = st.getState();
                          s.setNodes(s.nodes.filter((n) => n.id !== openBlock.id));
                          s.setEdges(s.edges.filter((e) => e.from !== openBlock.id && e.to !== openBlock.id));
                          closeSlide();
                          toast('Removed from canvas');
                        },
                        onError: () => toast('Failed to remove'),
                      })
                  : undefined
              }
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
                          ? `Moved to ${updated.department}`
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
                    // 레인 폭은 phase id 기준이라 없어진 phase의 폭이 남아 있어도 무해하다.
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
            />
          )}

          {addDlg && (
            <AddBlockDialog
              workflowName={workflow.name}
              phases={phaseList}
              onClose={() => st.getState().setAddDlg(false)}
              onCreate={({ name, phaseId }) => {
                createBlock.mutate(
                  { name, phaseId, layout: { x: 0, y: 0, w: 295, h: 160 } },
                  {
                    onSuccess: (created) => {
                      const s = st.getState();
                      const fresh = toCanvasNode(created);
                      placeInLane(fresh, phaseList, s.phasePW);
                      s.setNodes([...s.nodes, fresh]);
                      s.setAddDlg(false);
                      // 이번 편집 세션 중 새로 생겼다고 기록 — Cancel 시 실제로 삭제해야
                      // "추가를 취소"한 게 된다.
                      s.trackAddedDeliverable(created.id);
                      s.setFocusReq(fresh.id);
                      toast('Block added');
                    },
                    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to add'),
                  },
                );
              }}
            />
          )}

          {releaseOpen && (
            <ReleaseDialog
              workflowName={workflow.name}
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

          {historyOpen && (
            <ReleaseHistoryDialog
              workflowName={workflow.name}
              releases={releases.data ?? []}
              departmentOptions={project?.departments ?? []}
              onClose={() => setHistoryOpen(false)}
              onOpenArtifact={(blockId) => {
                setHistoryOpen(false);
                st.getState().openDeliverable(blockId);
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
