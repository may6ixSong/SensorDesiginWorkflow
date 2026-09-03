import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { useAuth } from '@/app/providers/AuthProvider';
import { CalypsoMark } from '@/components/common/Icon';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { NoticeBell } from './NoticeBell';
import { LanguagePopover } from './LanguagePopover';
import { ThemeTogglePlatform } from './ThemeTogglePlatform';
import { ProfileButton } from './ProfileButton';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface AppShellProps {
  children: ReactNode;
}

const NAV_LABEL = 'Projects';

/**
 * Calypso 상단바 — SIREN web의 AppShell(components/layout/AppShell.tsx)과 레이아웃을
 * 그대로 맞췄다: 로고+워드마크, 페이지 네비, notice/guide/language/theme 버튼,
 * 사용자 배지. Calypso는 workflow/project select나 Admin 네비가 없으므로 그 부분만
 * 뺐다 — 나머지 chrome은 동일한 ADSSO/common-platform 연동(AuthProvider)에 물린다.
 */
export function AppShell({ children }: AppShellProps) {
  const { user } = useAuth();
  const { pathname } = useLocation();
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
            display: 'flex', alignItems: 'center', gap: '10px',
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <CalypsoMark />
          <Box sx={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, lineHeight: 1.05 }}>
            <Box component="span" sx={{ color: T.tx, letterSpacing: '.02em' }}>
              CALYPSO
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
              ARTIFACT REGISTRY
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

        <Box sx={{ flex: 1 }} />

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
