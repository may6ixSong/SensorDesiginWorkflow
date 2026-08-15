import { ReactNode } from 'react';
import { AppBar, Avatar, Box, MenuItem, Select, Stack, Toolbar, Typography } from '@mui/material';
import { ProjectDto, IpDto } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';
import { useSwitchableUsers, useDevLogin } from '@/api/hooks/useAuth';
import { useCanvasStore } from '@/store/canvasStore';
import { DEPARTMENTS } from '@/shared/constants/departments';
import { tokens } from '@/theme/theme';

interface AppShellProps {
  projects: ProjectDto[];
  projectId: string | undefined;
  onChangeProject: (id: string) => void;
  ips: IpDto[];
  ipId: string | undefined;
  onChangeIp: (id: string) => void;
  children: ReactNode;
}

/** 상단바: 과제/IP select, 사용자 스위처, 수신부서 시점 토글 (설계서 7.1 컴포넌트 트리, 1.3). */
export function AppShell({ projects, projectId, onChangeProject, ips, ipId, onChangeIp, children }: AppShellProps) {
  const user = useAuthStore((s) => s.user);
  const { data: switchableUsers } = useSwitchableUsers();
  const devLogin = useDevLogin();
  const recvDeptFocus = useCanvasStore((s) => s.recvDeptFocus);
  const setRecvDeptFocus = useCanvasStore((s) => s.setRecvDeptFocus);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: `1px solid ${tokens.border}` }}>
        <Toolbar variant="dense" sx={{ gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={800} color="primary.main" sx={{ mr: 1 }}>
            ARBOR
          </Typography>

          <Select size="small" value={projectId ?? ''} onChange={(e) => onChangeProject(e.target.value)} sx={{ minWidth: 160 }}>
            {projects.map((p) => (
              <MenuItem key={p._id} value={p._id}>
                {p.code} · {p.name}
              </MenuItem>
            ))}
          </Select>

          <Select size="small" value={ipId ?? ''} onChange={(e) => onChangeIp(e.target.value)} sx={{ minWidth: 140 }} disabled={!ips.length}>
            {ips.map((ip) => (
              <MenuItem key={ip.id} value={ip.id}>
                {ip.name}
              </MenuItem>
            ))}
          </Select>

          <Select
            size="small"
            value={recvDeptFocus ?? ''}
            displayEmpty
            onChange={(e) => setRecvDeptFocus(e.target.value || null)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">수신부서 시점: 전체</MenuItem>
            {DEPARTMENTS.filter((d) => d.id !== 'analog').map((d) => (
              <MenuItem key={d.id} value={d.id}>
                수신부서: {d.name}
              </MenuItem>
            ))}
          </Select>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Avatar sx={{ width: 28, height: 28, fontSize: 13 }}>{user?.name?.slice(0, 1) ?? '?'}</Avatar>
            <Select
              size="small"
              value={user?.id ?? ''}
              displayEmpty
              onChange={(e) => devLogin.mutate(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="" disabled>
                사용자 전환 (SSO 대체)
              </MenuItem>
              {(switchableUsers ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} · {u.department}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</Box>
    </Box>
  );
}
