import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { IpDto, ProjectDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/app/providers/AuthProvider';
import { SirenMark, Icon } from '@/components/common/Icon';
import { SirenButton } from '@/components/common/SirenButton';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { NoticeBell } from './NoticeBell';
import { LanguagePopover } from './LanguagePopover';
import { ThemeTogglePlatform } from './ThemeTogglePlatform';
import { ProfileButton } from './ProfileButton';
import { NavDropdown } from './NavDropdown';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface AppShellProps {
  /** Project/IP selects only appear on the board (/details). Omit to hide them. */
  projects?: ProjectDto[];
  projectId?: string;
  onChangeProject?: (id: string) => void;
  ips?: IpDto[];
  ipId?: string;
  onChangeIp?: (id: string) => void;
  canToggleRecv?: boolean;
  children: ReactNode;
}

// Short technical labels used throughout the top bar are kept in English
// regardless of the language toggle (matches the rest of the mock content —
// IP/deliverable names, phase codes — which is English-only by design).
const NAV_LABEL = 'Project List';

/**
 * 목업 .tb 상단바 — 로고 + SIREN 워드마크 + 페이지 네비 + (보드에서만) 과제/IP select
 * + 수신부서 시점 + 사용자 배지. (설계서 7.1 컴포넌트 트리의 AppShell)
 *
 * Right-side chrome (language/theme/notices/profile) mirrors SSM_WEB's
 * TopAppBar, wired to the platform AuthProvider (ADSSO / dev fixed admin) and
 * the common-platform APIs. Who is "logged in" for SIREN's own dept-based
 * permissions (project/IP ownership) is unrelated plumbing — see
 * store/authStore.ts + api/hooks/useAuth.ts — and unaffected by this.
 */
export function AppShell({
  projects, projectId, onChangeProject,
  ips, ipId, onChangeIp,
  canToggleRecv = false, children,
}: AppShellProps) {
  const { user } = useAuth();
  const recv = useCanvasStore((s) => s.recv);
  const setRecv = useCanvasStore((s) => s.setRecv);
  const { pathname } = useLocation();

  const showSelects = !!onChangeProject;
  const navOn = pathname.startsWith('/projects');

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
          <Box sx={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, lineHeight: 1.05 }}>
            <Box component="span" sx={{ color: T.tx, letterSpacing: '.02em' }}>
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
          <Box
            component={Link}
            to="/projects"
            sx={{
              fontSize: 12, fontWeight: navOn ? 600 : 500, textDecoration: 'none',
              padding: '6px 10px', borderRadius: '7px', whiteSpace: 'nowrap', flex: '0 0 auto',
              color: navOn ? T.tx : T.dm,
              background: navOn ? T.sf3 : 'transparent',
              '&:hover': { background: T.sf2, color: T.tx },
            }}
          >
            {NAV_LABEL}
          </Box>
        </Box>

        {showSelects && (
          <>
            <Box sx={{ width: '1px', height: 22, background: T.ln }} />
            <NavDropdown
              value={projectId ?? ''}
              onChange={onChangeProject!}
              width={260}
              options={(projects ?? []).map((p) => ({ value: p._id, label: `${p.code} · ${p.name}` }))}
            />
            {projectId && (
              <HeaderIconButton icon="info" label="Project Info" to={`/projects/${projectId}`} />
            )}
            <NavDropdown
              value={ipId ?? ''}
              onChange={onChangeIp!}
              width={180}
              disabled={!ips?.length}
              placeholder="No access"
              options={ips?.length ? ips.map((i) => ({ value: i.id, label: i.name })) : []}
            />
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {canToggleRecv && (
          <SirenButton variant={recv ? 'on' : 'default'} onClick={() => setRecv(!recv)}>
            <Icon name="eye" /> Recipient-dept view
          </SirenButton>
        )}

        <HeaderIconButton
          iconElement={<MenuBookRoundedIcon sx={{ fontSize: 20 }} />}
          label="User Guide"
          to="/guide"
        />
        <NoticeBell clientId={user?.KnoxID ?? ''} />
        <LanguagePopover />
        <ThemeTogglePlatform />
        <ProfileButton />
      </Box>

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
