import { useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Milestone, ProjectMemberDto, WorkflowDto } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { ProjectTimeline } from '@/components/project/ProjectTimeline';
import { EditMilestonesDialog } from '@/components/dialogs/EditMilestonesDialog';
import { CreateWorkflowDialog } from '@/components/dialogs/CreateWorkflowDialog';
import { useCreateWorkflow, useUpdateMilestones } from '@/api/hooks/useProjects';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';
import { canEditMilestones } from '@/lib/access';
import { useAuth } from '@/app/providers/AuthProvider';

const errText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export function ProjectInfoPage() {
  return (
    <ProjectPageShell>
      {({ project, workflows }) => (
        <MilestonesSection
          projectId={project._id}
          milestones={project.milestones}
          managers={project.managers}
          members={project.members}
          workflows={workflows}
        />
      )}
    </ProjectPageShell>
  );
}

/**
 * 과제 공통 일정(마일스톤) + 그 날짜축 위에 얹은 workflow별 일정.
 *
 * 여기서 고치는 것은 오직 과제 마일스톤이다 — workflow의 phase는 그 workflow의 보드에서
 * 고친다(phase가 workflow 소유 데이터이기 때문). 그래서 버튼 이름도 "Edit milestones"다.
 *
 * "New Workflow"도 여기 둔다(사용자 요청) — 예전 Design domains 섹션이 없어지면서
 * workflow를 새로 만드는 진입점이 이 Schedule 섹션 하나로 합쳐졌다.
 */
function MilestonesSection({
  projectId, milestones, managers, members, workflows,
}: {
  projectId: string; milestones: Milestone[]; managers: string[];
  members: ProjectMemberDto[]; workflows: WorkflowDto[];
}) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const updateMilestones = useUpdateMilestones(projectId);
  const createWorkflow = useCreateWorkflow(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const canEditSchedule = canEditMilestones({ managers }, isAdmin, user?.KnoxID);
  const myDepartments = members.find((m) => m.knoxId === user?.KnoxID)?.departments ?? [];

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
          Schedule
          <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
            project milestones and every workflow's own plan, on one date axis
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        {canEditSchedule && (
          <SirenButton onClick={() => { setEditErr(null); setEditOpen(true); }}>
            <Icon name="calendar" /> Edit milestones
          </SirenButton>
        )}
        <SirenButton variant="primary" onClick={() => { setCreateErr(null); setCreateOpen(true); }}>
          <Icon name="plus" /> New Workflow
        </SirenButton>
      </Box>
      <ProjectTimeline projectId={projectId} milestones={milestones} workflows={workflows} />

      {createOpen && (
        <CreateWorkflowDialog
          myDepartments={myDepartments}
          isAdmin={isAdmin}
          milestones={milestones}
          saving={createWorkflow.isPending}
          error={createErr}
          onClose={() => setCreateOpen(false)}
          onCreate={(payload) => {
            setCreateErr(null);
            createWorkflow.mutate(payload, {
              onSuccess: (workflow) => {
                setCreateOpen(false);
                toast(`Workflow created with ${workflow.phases.length} phase(s) copied from the milestones`);
                // 바로 보드로 보내 준다 — 만들자마자 할 일이 "일정을 내 것으로 고치는" 것이라서.
                navigate(`/details/${projectId}/${workflow.id}`);
              },
              onError: (e) => setCreateErr(errText(e, 'Failed to create workflow')),
            });
          }}
        />
      )}

      {editOpen && (
        <EditMilestonesDialog
          milestones={milestones}
          saving={updateMilestones.isPending}
          error={editErr}
          onClose={() => setEditOpen(false)}
          onSave={(next) => {
            setEditErr(null);
            updateMilestones.mutate(next, {
              onSuccess: () => { setEditOpen(false); toast('Project milestones updated'); },
              onError: (e: any) => setEditErr(e?.response?.data?.message ?? 'Failed to save'),
            });
          }}
        />
      )}
    </>
  );
}
