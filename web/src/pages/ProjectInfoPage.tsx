import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { MilestoneIpBoard } from '@/components/project/MilestoneIpBoard';
import { T } from '@/theme/tokens';
import { Box } from '@mui/material';

export function ProjectInfoPage() {
  return (
    <ProjectPageShell>
      {({ project, ips }) => (
        <>
          <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', mb: '12px' }}>
            Milestones
            <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
              IP status across every phase
            </Box>
          </Box>
          <MilestoneIpBoard projectId={project._id} phases={project.phases} ips={ips} />
        </>
      )}
    </ProjectPageShell>
  );
}
