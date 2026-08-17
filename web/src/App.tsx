import { Route, Routes } from 'react-router-dom';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDevLogin, useSwitchableUsers } from '@/api/hooks/useAuth';
import { DetailsRedirect } from '@/pages/DetailsRedirect';
import { HomePage } from '@/pages/HomePage';
import { ProjectListPage } from '@/pages/ProjectListPage';
import { ProjectInfoPage } from '@/pages/ProjectInfoPage';
import { BoardPage } from '@/pages/BoardPage';
import { NoAccessPage } from '@/pages/NoAccessPage';
import { GuidePage } from '@/pages/GuidePage';

/**
 * 사내 SSO 연동 전제 (설계서 1.3). 현재 단계에서는 로그인 검사 자체를 생략하고,
 * 스위처 목록의 첫 사용자로 자동 로그인해 바로 앱으로 들어간다. 사용자 전환은
 * AppShell 상단바의 사용자 스위처에서 계속할 수 있다.
 * TODO: SSO 연동 지점 - 실제 연동 시 이 자동 로그인을 IdP 리다이렉트 플로우로 교체.
 */
function LoginGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const { data: users, isError: usersError, error: usersErrorObj, refetch: refetchUsers } = useSwitchableUsers();
  const devLogin = useDevLogin();
  const attempted = useRef(false);

  useEffect(() => {
    if (token || attempted.current || !users?.length) return;
    attempted.current = true;
    // Analog 부서는 반드시 IP의 Edit 권한자(owner)이므로 접근 가능한 프로젝트가 보장된다.
    // 그 외 부서는 viewGrant가 없으면 접근 가능한 IP가 하나도 없을 수 있다(설계서 3.3).
    const target = users.find((u) => u.department === 'analog') ?? users[0];
    devLogin.mutate(target.id);
  }, [token, users, devLogin]);

  if (token) return <>{children}</>;

  const failureMessage = usersError
    ? `Failed to load user list: ${(usersErrorObj as any)?.message ?? 'Unknown error'}`
    : devLogin.isError
      ? `Automatic sign-in failed: ${(devLogin.error as any)?.message ?? 'Unknown error'}`
      : !usersError && users !== undefined && users.length === 0
        ? 'No seeded users found. Run `npm run seed` in api/.'
        : null;

  if (failureMessage) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: '100vh', px: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          {failureMessage}
        </Alert>
        <Typography variant="caption" color="text.secondary">
          Check that the API server (npm run start:dev) is running and web/.env's VITE_API_BASE_URL is correct.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => {
            attempted.current = false;
            devLogin.reset();
            refetchUsers();
          }}
        >
          Retry
        </Button>
      </Stack>
    );
  }

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <CircularProgress size={28} />
    </Stack>
  );
}

export default function App() {
  return (
    <LoginGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<ProjectInfoPage />} />
        <Route path="/details" element={<DetailsRedirect />} />
        <Route path="/details/:projectId" element={<DetailsRedirect />} />
        <Route path="/details/:projectId/:ipId" element={<BoardPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/no-access" element={<NoAccessPage />} />
      </Routes>
    </LoginGate>
  );
}
