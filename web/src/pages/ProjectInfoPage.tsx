import { useState } from 'react';
import { Box } from '@mui/material';
import { Milestone, WorkflowDto } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { ProjectTimeline } from '@/components/project/ProjectTimeline';
import { EditMilestonesDialog } from '@/components/dialogs/EditMilestonesDialog';
import { DesignWorkflowDialog } from '@/components/workflow/DesignWorkflowDialog';
import { DesignDomainsSection } from '@/components/project/DesignDomainsSection';
import { useUpdateMilestones } from '@/api/hooks/useProjects';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

export function ProjectInfoPage() {
  return (
    <ProjectPageShell>
      {({ project, workflows, own }) => (
        <>
          <MilestonesSection
            projectId={project._id}
            projectName={project.name}
            projectCode={project.code}
            milestones={project.milestones}
            workflows={workflows}
            own={own}
            workflowDomains={project.workflowDomains ?? []}
          />
          <DesignDomainsSection
            projectId={project._id}
            workflowDomains={project.workflowDomains ?? []}
            milestones={project.milestones}
            workflows={workflows}
            own={own}
          />
        </>
      )}
    </ProjectPageShell>
  );
}

/**
 * 과제 공통 일정(마일스톤) + 그 날짜축 위에 얹은 workflow별 일정.
 *
 * 여기서 고치는 것은 오직 과제 마일스톤이다 — workflow의 phase는 그 workflow의 보드에서
 * 고친다(phase가 workflow 소유 데이터이기 때문). 그래서 버튼 이름도 "Edit milestones"다.
 */
function MilestonesSection({
  projectId, projectName, projectCode, milestones, workflows, own, workflowDomains,
}: {
  projectId: string; projectName: string; projectCode: string;
  milestones: Milestone[]; workflows: WorkflowDto[]; own: boolean; workflowDomains: string[];
}) {
  const updateMilestones = useUpdateMilestones(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);

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
        <SirenButton variant="on" onClick={() => setWorkflowOpen(true)}>
          <Icon name="grid" /> Design workflow
        </SirenButton>
        {own && (
          <SirenButton onClick={() => { setEditErr(null); setEditOpen(true); }}>
            <Icon name="calendar" /> Edit milestones
          </SirenButton>
        )}
      </Box>
      <ProjectTimeline projectId={projectId} milestones={milestones} workflows={workflows} />

      <DesignWorkflowDialog
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode}
        milestones={milestones}
        workflows={workflows}
        workflowDomains={workflowDomains}
      />

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
