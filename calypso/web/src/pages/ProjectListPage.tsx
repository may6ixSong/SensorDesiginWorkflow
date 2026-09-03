import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Icon } from '@/components/common/Icon';
import { listSirenProjects, SirenProject } from '@/api/sirenClient';
import { CURSOR_POINTER, FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

/**
 * 홈 = Project List (사용자 요청) — SIREN이 Project 전체를 관리하는 hub이고,
 * Calypso는 그 목록을 그대로 읽어온다. 여기서 만들거나 지우지 않는다 — 프로젝트
 * 생성/관리는 SIREN의 몫이고, Calypso는 그 project 아래 산출물만 다룬다.
 */
export function ProjectListPage() {
  const [q, setQ] = useState('');
  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['siren', 'projects'],
    queryFn: listSirenProjects,
  });

  const list = (projects ?? []).filter((p) =>
    `${p.code} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 1000, mx: 'auto', px: '28px', py: '30px' }}>
          <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>
            Projects
          </Box>

          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '7px', mt: '20px', mb: '20px',
              background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '8px',
              padding: '0 10px', height: 34, maxWidth: 320, boxShadow: T.ss,
              '&:focus-within': { borderColor: T.tl3, boxShadow: `0 0 0 3px ${T.tl2}` },
            }}
          >
            <Box component="span" sx={{ color: T.dm2, display: 'flex' }}>
              <Icon name="search" />
            </Box>
            <Box
              component="input"
              value={q}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              placeholder="Search projects"
              sx={{
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'inherit', fontSize: 12.5, flex: 1, color: T.tx,
                '&::placeholder': { color: T.dm2 },
              }}
            />
          </Box>

          {isError ? (
            <Typography sx={{ fontSize: 13, color: T.dm }}>
              Could not reach SIREN. Check SIREN_API and its CORS_ORIGIN.
            </Typography>
          ) : isLoading ? null : list.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: T.dm }}>
              {q ? 'No projects match your search.' : 'No projects registered in SIREN yet.'}
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {list.map((p) => (
                <ProjectRow key={p._id} project={p} />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </AppShell>
  );
}

function ProjectRow({ project }: { project: SirenProject }) {
  const navigate = useNavigate();
  return (
    <Box
      onClick={() => navigate(`/projects/${project._id}`)}
      sx={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '14px 18px', border: `1px solid ${T.ln}`, borderRadius: '12px',
        background: T.sf, cursor: CURSOR_POINTER,
        transition: 'transform .16s cubic-bezier(.2,.8,.3,1), box-shadow .16s, border-color .16s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: T.sl, borderColor: T.ln2 },
      }}
    >
      <Box
        component="span"
        sx={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.1em', padding: '3px 8px',
          borderRadius: '6px', background: T.sf3, color: T.dm, border: `1px solid ${T.ln}`,
          flex: '0 0 auto',
        }}
      >
        {project.code}
      </Box>
      <Box sx={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{project.name}</Box>
      <Box
        component="span"
        sx={{
          fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.1em', padding: '2px 7px',
          borderRadius: '999px', background: T.tl2, color: T.tl, border: `1px solid ${T.tl3}`,
        }}
      >
        {project.status}
      </Box>
      <Icon name="expand" />
    </Box>
  );
}
