import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { IpDto, ProjectDto, UserDto } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useDevLogin } from '@/api/hooks/useAuth';
import { departmentName } from '@/shared/constants/departments';
import { SirenMark, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton } from '@/components/common/SirenButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LanguageToggle } from '@/components/common/LanguageToggle';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { SelectBox } from './SelectBox';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface AppShellProps {
  /** Project/IP selects only appear on the board (/details). Omit to hide them. */
  projects?: ProjectDto[];
  projectId?: string;
  onChangeProject?: (id: string) => void;
  ips?: IpDto[];
  ipId?: string;
  onChangeIp?: (id: string) => void;
  users: UserDto[];
  canToggleRecv?: boolean;
  children: ReactNode;
}

const NAV = [{ to: '/projects', label: 'Projects' }];

/**
 * 목업 .tb 상단바 — 로고 + SIREN 워드마크 + 페이지 네비 + (보드에서만) 과제/IP select
 * + 수신부서 시점 + 사용자 배지. (설계서 7.1 컴포넌트 트리의 AppShell)
 */
export function AppShell({
  projects, projectId, onChangeProject,
  ips, ipId, onChangeIp,
  users, canToggleRecv = false, children,
}: AppShellProps) {
  const me = useAuthStore((s) => s.user);
  const devLogin = useDevLogin();
  const recv = useCanvasStore((s) => s.recv);
  const setRecv = useCanvasStore((s) => s.setRecv);
  const { pathname } = useLocation();

  const showSelects = !!onChangeProject;

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
        <Box
          component={Link}
          to="/"
          sx={{
            display: 'flex', alignItems: 'center', gap: '12px',
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <SirenMark />
          <Box sx={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY, lineHeight: 1.05 }}>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                background: `linear-gradient(100deg, ${T.tl} 0%, ${T.vi} 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '.01em',
              }}
            >
              SIREN
            </Box>
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
              SENSOR DESIGN WORKFLOW
            </Box>
          </Box>
        </Box>

        <Box sx={{ width: '1px', height: 22, background: T.ln }} />

        <Box sx={{ display: 'flex', gap: '2px' }}>
          {NAV.map((n) => {
            const on = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to);
            return (
              <Box
                key={n.to}
                component={Link}
                to={n.to}
                sx={{
                  fontSize: 12, fontWeight: on ? 600 : 500, textDecoration: 'none',
                  padding: '6px 10px', borderRadius: '7px',
                  color: on ? T.tx : T.dm,
                  background: on ? T.sf3 : 'transparent',
                  '&:hover': { background: T.sf2, color: T.tx },
                }}
              >
                {n.label}
              </Box>
            );
          })}
        </Box>

        {showSelects && (
          <>
            <Box sx={{ width: '1px', height: 22, background: T.ln }} />
            <SelectBox
              label="Project"
              value={projectId ?? ''}
              onChange={onChangeProject!}
              options={(projects ?? []).map((p) => ({ value: p._id, label: `${p.code} · ${p.name}` }))}
            />
            <SelectBox
              label="IP"
              value={ipId ?? ''}
              onChange={onChangeIp!}
              minWidth={110}
              disabled={!ips?.length}
              options={
                ips?.length
                  ? ips.map((i) => ({ value: i.id, label: i.name }))
                  : [{ value: '', label: 'No access' }]
              }
            />
            {projectId && <HeaderIconButton icon="info" label="Project information" to={`/projects/${projectId}`} />}
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {canToggleRecv && (
          <SirenButton variant={recv ? 'on' : 'default'} onClick={() => setRecv(!recv)}>
            <Icon name="eye" /> Recipient-dept view
          </SirenButton>
        )}

        <HeaderIconButton icon="book" label="User guide" to="/guide" />
        <LanguageToggle />
        <ThemeToggle />

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
