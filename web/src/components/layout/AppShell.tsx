import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { WorkflowDto, ProjectDto } from '@/types/domain';
import { useAuth } from '@/app/providers/AuthProvider';
import { SirenMark } from '@/components/common/Icon';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { NoticeBell } from './NoticeBell';
import { LanguagePopover } from './LanguagePopover';
import { ThemeTogglePlatform } from './ThemeTogglePlatform';
import { ProfileButton } from './ProfileButton';
import { SelectBox } from './SelectBox';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface AppShellProps {
  /** Project/workflow selects only appear on the board (/details). Omit to hide them. */
  projects?: ProjectDto[];
  projectId?: string;
  onChangeProject?: (id: string) => void;
  workflows?: WorkflowDto[];
  workflowId?: string;
  onChangeIp?: (id: string) => void;
  children: ReactNode;
}

// Short technical labels used throughout the top bar are kept in English
// regardless of the language toggle (matches the rest of the mock content —
// workflow/deliverable names, phase codes — which is English-only by design).
const NAV_LABEL = 'Project List';

/**
 * 목업 .tb 상단바 — 로고 + SIREN 워드마크 + 페이지 네비 + (보드에서만) 과제/workflow select
 * + 사용자 배지. (설계서 7.1 컴포넌트 트리의 AppShell)
 *
 * Right-side chrome (language/theme/notices/profile) mirrors SSM_WEB's
 * TopAppBar, wired to the platform AuthProvider (ADSSO / dev fixed admin) and
 * the common-platform APIs. The same ADSSO identity drives SIREN's own
 * dept-based permissions — api/는 X-Knox-Id 헤더로만 호출자를 식별한다
 * (api/client.ts의 setApiKnoxId).
 */
export function AppShell({
  projects, projectId, onChangeProject,
  workflows, workflowId, onChangeIp,
  children,
}: AppShellProps) {
  const { user, isAdmin } = useAuth();
  const { pathname } = useLocation();

  const showSelects = !!onChangeProject;
  const navOn = pathname.startsWith('/projects');
  const adminOn = pathname.startsWith('/admin');

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
          // 좁은 화면에서 아이템이 잘리는 대신 가로 스크롤되게 — 뷰포트보다 넓어져도
          // 테마 토글·프로필처럼 뒤쪽 컨트롤이 완전히 사라지지 않는다.
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        <Box
          component={Link}
          to="/"
          sx={{
            display: 'flex', alignItems: 'center', gap: '12px',
            textDecoration: 'none', color: 'inherit', flex: '0 0 auto',
          }}
        >
          <SirenMark />
          <Box sx={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, lineHeight: 1.05, whiteSpace: 'nowrap' }}>
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

        <Box sx={{ width: '1px', height: 22, background: T.ln, flex: '0 0 auto' }} />

        <Box sx={{ display: 'flex', gap: '2px', flex: '0 0 auto' }}>
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
          {/*
            Admin 전용 진입점은 non-admin에게 아예 렌더하지 않는다 (Hub 설계서 §13.3 규칙 6).
            AdminPage가 라우트 진입도 막고, 최종 방어선은 api의 isAdmin 재검증이다.
          */}
          {isAdmin && (
            <Box
              component={Link}
              to="/admin"
              sx={{
                fontSize: 12, fontWeight: adminOn ? 600 : 500, textDecoration: 'none',
                padding: '6px 10px', borderRadius: '7px', whiteSpace: 'nowrap', flex: '0 0 auto',
                color: adminOn ? T.tx : T.dm,
                background: adminOn ? T.sf3 : 'transparent',
                '&:hover': { background: T.sf2, color: T.tx },
              }}
            >
              Admin
            </Box>
          )}
        </Box>

        {showSelects && (
          <>
            <Box sx={{ width: '1px', height: 22, background: T.ln, flex: '0 0 auto' }} />
            <Box sx={{ flex: '0 0 auto' }}>
              <SelectBox
                label="Project"
                value={projectId ?? ''}
                onChange={onChangeProject!}
                options={(projects ?? []).map((p) => ({ value: p._id, label: `${p.code} · ${p.name}` }))}
              />
            </Box>
            <Box sx={{ flex: '0 0 auto' }}>
              <SelectBox
                label="workflow"
                value={workflowId ?? ''}
                onChange={onChangeIp!}
                minWidth={110}
                disabled={!workflows?.length}
                options={
                  workflows?.length
                    ? workflows.map((i) => ({ value: i.id, label: i.name }))
                    : [{ value: '', label: 'No access' }]
                }
              />
            </Box>
            {projectId && <HeaderIconButton icon="info" label="Project Info" to={`/projects/${projectId}`} />}
          </>
        )}

        <Box sx={{ flex: 1, minWidth: '12px' }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 auto' }}>
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
      </Box>

      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
