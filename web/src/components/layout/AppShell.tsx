import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IpDto, ProjectDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';
import { usePlatformAuth } from '@/app/providers/AuthProvider';
import { SirenMark, Icon } from '@/components/common/Icon';
import { SirenButton } from '@/components/common/SirenButton';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { NoticeBell } from './NoticeBell';
import { LanguagePopover } from './LanguagePopover';
import { ThemeTogglePlatform } from './ThemeTogglePlatform';
import { ProfileButton } from './ProfileButton';
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
  canToggleRecv?: boolean;
  children: ReactNode;
}

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
  const { t } = useTranslation();
  const { platformUser } = usePlatformAuth();
  const recv = useCanvasStore((s) => s.recv);
  const setRecv = useCanvasStore((s) => s.setRecv);
  const { pathname } = useLocation();

  const showSelects = !!onChangeProject;
  const nav = [{ to: '/projects', label: t('appShell.nav.projects') }];

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
          {nav.map((n) => {
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
                  : [{ value: '', label: t('appShell.noAccess') }]
              }
            />
            {projectId && <HeaderIconButton icon="info" label={t('appShell.projectInfo')} to={`/projects/${projectId}`} />}
          </>
        )}

        <Box sx={{ flex: 1 }} />

        {canToggleRecv && (
          <SirenButton variant={recv ? 'on' : 'default'} onClick={() => setRecv(!recv)}>
            <Icon name="eye" /> {t('appShell.recvView')}
          </SirenButton>
        )}

        <HeaderIconButton icon="book" label={t('appShell.guide')} to="/guide" />
        <NoticeBell clientId={platformUser?.KnoxID ?? ''} />
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
