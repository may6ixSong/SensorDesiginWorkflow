import { ReactNode, useMemo, useState } from 'react';
import { Box, CircularProgress, Stack, Tooltip, Typography } from '@mui/material';
import { Link, useLocation, useParams } from 'react-router-dom';
import { WorkflowDto, ProjectDetailDto } from '@/types/domain';
import { useProject, useProjectWorkflows } from '@/api/hooks/useProjects';
import { AppShell } from '@/components/layout/AppShell';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { SirenButton } from '@/components/common/SirenButton';
import { DesignWorkflowDialog } from '@/components/workflow/DesignWorkflowDialog';
import { progressOf } from '@/lib/projectProgress';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';
import { canManageProject } from '@/lib/access';
import { useAuth } from '@/app/providers/AuthProvider';

const TABS = [
  { to: '', label: 'Information', icon: 'info' as const },
  { to: '/members', label: 'Members', icon: 'users' as const },
  { to: '/artifacts', label: 'Artifacts', icon: 'list' as const },
];

interface Props {
  children: (ctx: { project: ProjectDetailDto; workflows: WorkflowDto[]; own: boolean }) => ReactNode;
}

/**
 * Project Information / Members 페이지가 공유하는 헤더 — 메타데이터 + Edit 버튼 +
 * 두 페이지를 오가는 탭. 데이터 로딩도 여기서 한 번만 수행해 두 페이지가 각자
 * 다시 fetch하지 않게 한다.
 */
export function ProjectPageShell({ children }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const { data: project, isLoading: projectLoading, isError } = useProject(projectId);
  const { data: workflows, isLoading: ipsLoading } = useProjectWorkflows(projectId);
  const { isAdmin } = useAuth();
  const [workflowOpen, setWorkflowOpen] = useState(false);

  const own = useMemo(() => canManageProject(workflows, isAdmin), [workflows, isAdmin]);
  const { pct, current, done, total } = useMemo(
    () => progressOf(project?.milestones ?? []),
    [project?.milestones],
  );

  if (projectLoading || ipsLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (isError || !project) {
    return (
      <AppShell>
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>No viewable project</Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              You don't have access to any workflow under this project.
            </Typography>
          </Box>
        </Box>
      </AppShell>
    );
  }

  const base = `/projects/${project._id}`;

  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 1180, mx: 'auto', px: '28px', py: '30px' }}>
          {/* ── 메타데이터 헤더 ── */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px', mb: '18px', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 260 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '6px' }}>
                <Box
                  component="span"
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: '.1em', padding: '2px 8px',
                    borderRadius: '6px', background: T.sf3, color: T.dm, border: `1px solid ${T.ln}`,
                  }}
                >
                  {project.code}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.1em', padding: '2px 8px',
                    borderRadius: '999px', background: T.tl2, color: T.tl, border: `1px solid ${T.tl3}`,
                  }}
                >
                  {project.status}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Box
                  sx={{
                    fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: 700, letterSpacing: '-.005em',
                    lineHeight: 1.35, py: '2px',
                  }}
                >
                  {project.name}
                </Box>
                <Tooltip title="Design workflow">
                  <SirenButton
                    variant="ghost"
                    onClick={() => setWorkflowOpen(true)}
                    sx={{ padding: '6px 8px' }}
                    aria-label="Design workflow"
                  >
                    <Icon name="grid" size={17} />
                  </SirenButton>
                </Tooltip>
              </Box>
            </Box>

            <Card sx={{ width: 260 }}>
              <Ey sx={{ mb: '7px' }}>Project progress</Ey>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mb: '6px' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2 }}>{current}</Box>
                <Box sx={{ flex: 1 }} />
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: T.tl }}>{pct}%</Box>
              </Box>
              <Box sx={{ height: 6, borderRadius: 999, background: T.sf3, overflow: 'hidden' }}>
                <Box
                  sx={{
                    width: `${pct}%`, height: '100%', borderRadius: 999,
                    background: T.tl,
                  }}
                />
              </Box>
              <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '6px' }}>{done}/{total} milestones complete</Box>
            </Card>
          </Box>

          {/* ── 탭 ── */}
          <Box sx={{ display: 'flex', gap: '2px', mb: '24px', borderBottom: `1px solid ${T.ln}` }}>
            {TABS.map((t) => {
              const to = `${base}${t.to}`;
              const on = pathname === to || (t.to === '' && pathname === `${base}/`);
              return (
                <Box
                  key={t.to}
                  component={Link}
                  to={to}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '9px 14px', fontSize: 13, fontWeight: on ? 600 : 500,
                    color: on ? T.tl : T.dm, textDecoration: 'none',
                    borderBottom: `2px solid ${on ? T.tl : 'transparent'}`, mb: '-1px',
                    '&:hover': { color: T.tx },
                  }}
                >
                  <Icon name={t.icon} size={13} /> {t.label}
                </Box>
              );
            })}
          </Box>

          {children({ project, workflows: workflows ?? [], own })}
        </Box>
      </Box>

      <DesignWorkflowDialog
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        projectId={project._id}
        projectName={project.name}
        projectCode={project.code}
        milestones={project.milestones}
        workflows={workflows ?? []}
        departments={project.departments ?? []}
      />
    </AppShell>
  );
}
