import { useState } from 'react';
import { Box } from '@mui/material';
import { IpDto, PhaseRef } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { MilestoneIpBoard } from '@/components/project/MilestoneIpBoard';
import { EditMilestonesDialog } from '@/components/dialogs/EditMilestonesDialog';
import { WorkflowUniverseDialog } from '@/components/workflow/WorkflowUniverseDialog';
import { useUpdatePhases } from '@/api/hooks/useProjects';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { FONT_MONO, T } from '@/theme/tokens';

export function ProjectInfoPage() {
  return (
    <ProjectPageShell>
      {({ project, ips, own }) => (
        <MilestonesSection
          projectId={project._id}
          projectName={project.name}
          projectCode={project.code}
          phases={project.phases}
          ips={ips}
          own={own}
        />
      )}
    </ProjectPageShell>
  );
}

function MilestonesSection({
  projectId, projectName, projectCode, phases, ips, own,
}: {
  projectId: string; projectName: string; projectCode: string;
  phases: PhaseRef[]; ips: IpDto[]; own: boolean;
}) {
  const updatePhases = useUpdatePhases(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [universeOpen, setUniverseOpen] = useState(false);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
          Milestones
          <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
            IP status across every phase
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <TotalWorkflowButton count={ips.length} onClick={() => setUniverseOpen(true)} />
        {own && (
          <SirenButton onClick={() => { setEditErr(null); setEditOpen(true); }}>
            <Icon name="edit" /> Edit schedule
          </SirenButton>
        )}
      </Box>
      <MilestoneIpBoard projectId={projectId} phases={phases} ips={ips} />

      <WorkflowUniverseDialog
        open={universeOpen}
        onClose={() => setUniverseOpen(false)}
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode}
        ips={ips}
      />

      {editOpen && (
        <EditMilestonesDialog
          phases={phases}
          saving={updatePhases.isPending}
          error={editErr}
          onClose={() => setEditOpen(false)}
          onSave={(next) => {
            setEditErr(null);
            updatePhases.mutate(next, {
              onSuccess: () => { setEditOpen(false); toast('Milestone schedule updated'); },
              onError: (e: any) => setEditErr(e?.response?.data?.message ?? 'Failed to save'),
            });
          }}
        />
      )}
    </>
  );
}

/**
 * Milestones 보드 위의 "전체 워크플로 보기" 진입점. 이 버튼 하나가 과제의 모든 IP를
 * 도메인(항성계) 단위로 갈라 놓은 전체창 우주 지도를 연다 — 표에서는 안 보이는
 * IP↔IP 산출물 흐름이 여기서 항로로 드러난다.
 */
function TotalWorkflowButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      title="Open the total workflow view"
      sx={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px',
        padding: '6px 13px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, fontWeight: 600, color: '#eaf2ff', border: '1px solid rgba(120,150,220,.45)',
        background: 'linear-gradient(120deg, #101a33 0%, #1b1740 55%, #0d2a35 100%)',
        boxShadow: '0 2px 14px rgba(60,90,190,.28)',
        overflow: 'hidden', transition: '.18s',
        '&:hover': { boxShadow: '0 3px 20px rgba(90,120,240,.45)', transform: 'translateY(-1px)' },
        // 버튼 안에도 별을 몇 개 띄워 어디로 가는 문인지 미리 보여 준다.
        '&::before': {
          content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'radial-gradient(1.4px 1.4px at 14% 30%, rgba(255,255,255,.85), transparent),'
            + 'radial-gradient(1.1px 1.1px at 42% 72%, rgba(255,255,255,.6), transparent),'
            + 'radial-gradient(1.6px 1.6px at 72% 26%, rgba(255,255,255,.75), transparent),'
            + 'radial-gradient(1px 1px at 88% 64%, rgba(255,255,255,.5), transparent)',
        },
      }}
    >
      <Icon name="globe" size={13} />
      Total workflow
      <Box
        component="span"
        sx={{
          fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.08em', padding: '1px 6px',
          borderRadius: '999px', background: 'rgba(61,219,192,.16)', color: '#5fe7cd',
          border: '1px solid rgba(61,219,192,.38)',
        }}
      >
        {count} IP
      </Box>
    </Box>
  );
}
