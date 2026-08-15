import { Route, Routes } from 'react-router-dom';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDevLogin, useSwitchableUsers } from '@/api/hooks/useAuth';
import { HomeRedirect } from '@/pages/HomeRedirect';
import { BoardPage } from '@/pages/BoardPage';
import { NoAccessPage } from '@/pages/NoAccessPage';

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
    devLogin.mutate(users[0].id);
  }, [token, users, devLogin]);

  if (token) return <>{children}</>;

  const failureMessage = usersError
    ? `사용자 목록을 불러오지 못했습니다: ${(usersErrorObj as any)?.message ?? '알 수 없는 오류'}`
    : devLogin.isError
      ? `자동 로그인에 실패했습니다: ${(devLogin.error as any)?.message ?? '알 수 없는 오류'}`
      : !usersError && users !== undefined && users.length === 0
        ? '시드된 사용자가 없습니다. api/에서 npm run seed를 실행하세요.'
        : null;

  if (failureMessage) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: '100vh', px: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 480 }}>
          {failureMessage}
        </Alert>
        <Typography variant="caption" color="text.secondary">
          API 서버(npm run start:dev)가 실행 중인지, web/.env의 VITE_API_BASE_URL이 맞는지 확인하세요.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => {
            attempted.current = false;
            devLogin.reset();
            refetchUsers();
          }}
        >
          다시 시도
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
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/projects/:projectId" element={<HomeRedirect />} />
        <Route path="/projects/:projectId/ips/:ipId" element={<BoardPage />} />
        <Route path="/no-access" element={<NoAccessPage />} />
      </Routes>
    </LoginGate>
  );
}
