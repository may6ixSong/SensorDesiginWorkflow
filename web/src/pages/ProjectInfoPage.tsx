import { useState } from 'react';
import { Box } from '@mui/material';
import { IpDto, PhaseRef } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { MilestoneIpBoard } from '@/components/project/MilestoneIpBoard';
import { EditMilestonesDialog } from '@/components/dialogs/EditMilestonesDialog';
import { useUpdatePhases } from '@/api/hooks/useProjects';
import { AcroButton } from '@/components/common/AcroButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

export function ProjectInfoPage() {
  return (
    <ProjectPageShell>
      {({ project, ips, own }) => (
        <MilestonesSection projectId={project._id} phases={project.phases} ips={ips} own={own} />
      )}
    </ProjectPageShell>
  );
}

function MilestonesSection({
  projectId, phases, ips, own,
}: { projectId: string; phases: PhaseRef[]; ips: IpDto[]; own: boolean }) {
  const updatePhases = useUpdatePhases(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

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
        {own && (
          <AcroButton onClick={() => { setEditErr(null); setEditOpen(true); }}>
            <Icon name="edit" /> Edit schedule
          </AcroButton>
        )}
      </Box>
      <MilestoneIpBoard projectId={projectId} phases={phases} ips={ips} />

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
