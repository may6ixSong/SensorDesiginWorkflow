import { Route, Routes } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
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
  const { data: users } = useSwitchableUsers();
  const devLogin = useDevLogin();
  const attempted = useRef(false);

  useEffect(() => {
    if (token || attempted.current || !users?.length) return;
    attempted.current = true;
    devLogin.mutate(users[0].id);
  }, [token, users, devLogin]);

  if (token) return <>{children}</>;

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
