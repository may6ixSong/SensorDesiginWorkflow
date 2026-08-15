import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { IpDto, ProjectDto, UserDto } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useDevLogin } from '@/api/hooks/useAuth';
import { departmentName } from '@/shared/constants/departments';
import { ArborMark, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { ArborButton } from '@/components/common/ArborButton';
import { SelectBox } from './SelectBox';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface AppShellProps {
  projects: ProjectDto[];
  projectId: string | undefined;
  onChangeProject: (id: string) => void;
  ips: IpDto[];
  ipId: string | undefined;
  onChangeIp: (id: string) => void;
  users: UserDto[];
  canToggleRecv: boolean;
  children: ReactNode;
}

/**
 * 목업 .tb 상단바 — 로고 + ARBOR 워드마크 + 과제/IP select + 수신부서 시점 + 사용자 배지.
 * (설계서 7.1 컴포넌트 트리의 AppShell)
 */
export function AppShell({
  projects, projectId, onChangeProject,
  ips, ipId, onChangeIp,
  users, canToggleRecv, children,
}: AppShellProps) {
  const me = useAuthStore((s) => s.user);
  const devLogin = useDevLogin();
  const recv = useCanvasStore((s) => s.recv);
  const setRecv = useCanvasStore((s) => s.setRecv);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Box
        sx={{
          height: 54,
          flex: '0 0 54px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          px: '18px',
          borderBottom: `1px solid ${T.ln}`,
          background: T.sf,
          zIndex: 50,
          boxShadow: T.ss,
        }}
      >
        <ArborMark />
        <Box sx={{ fontSize: 15, fontWeight: 800, fontFamily: FONT_DISPLAY, lineHeight: 1.05 }}>
          ARBOR
          <Box
            component="small"
            sx={{
              display: 'block',
              fontSize: 9,
              letterSpacing: '.18em',
              color: T.dm2,
              fontFamily: FONT_MONO,
              mt: '2px',
              fontWeight: 400,
            }}
          >
            CIS DELIVERABLE CONTROL
          </Box>
        </Box>

        <Box sx={{ width: '1px', height: 22, background: T.ln }} />

        <SelectBox
          label="과제"
          value={projectId ?? ''}
          onChange={onChangeProject}
          options={projects.map((p) => ({ value: p._id, label: `${p.code} · ${p.name}` }))}
        />
        <SelectBox
          label="IP"
          value={ipId ?? ''}
          onChange={onChangeIp}
          minWidth={110}
          disabled={!ips.length}
          options={
            ips.length
              ? ips.map((i) => ({ value: i.id, label: i.name }))
              : [{ value: '', label: '권한 없음' }]
          }
        />

        <Box sx={{ flex: 1 }} />

        {canToggleRecv && (
          <ArborButton variant={recv ? 'on' : 'default'} onClick={() => setRecv(!recv)}>
            <Icon name="eye" /> 수신 부서 시점
          </ArborButton>
        )}

        <SelectBox
          padLeft={6}
          value={me?.id ?? ''}
          width={158}
          onChange={(id) => devLogin.mutate(id)}
          options={users.map((u) => ({
            value: u.id,
            label: `${u.name} · ${departmentName(u.department)}`,
          }))}
        >
          <UserAvatar user={me} />
        </SelectBox>
      </Box>

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
