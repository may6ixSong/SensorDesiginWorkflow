import { Route, Routes } from 'react-router-dom';
import { Button, CircularProgress, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDevLogin, useSwitchableUsers } from '@/api/hooks/useAuth';
import { HomeRedirect } from '@/pages/HomeRedirect';
import { BoardPage } from '@/pages/BoardPage';
import { NoAccessPage } from '@/pages/NoAccessPage';

/**
 * 사내 SSO 연동 전제 (설계서 1.3) - 로그인 화면 대신 사용자 스위처로 세션을 초기화한다.
 * TODO: SSO 연동 지점 - 실제 연동 시 이 게이트를 IdP 리다이렉트 플로우로 교체.
 */
function LoginGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const { data: users, isLoading } = useSwitchableUsers();
  const devLogin = useDevLogin();
  const [selected, setSelected] = useState('');

  if (token) return <>{children}</>;

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <Paper sx={{ p: 4, width: 360 }} elevation={3}>
        <Typography variant="h6" fontWeight={800} color="primary.main" gutterBottom>
          ARBOR
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          사내 SSO 연동 전이므로 사용자 스위처로 로그인합니다.
        </Typography>
        {isLoading ? (
          <CircularProgress size={24} />
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Select size="small" value={selected} displayEmpty onChange={(e) => setSelected(e.target.value)}>
              <MenuItem value="" disabled>
                사용자 선택
              </MenuItem>
              {(users ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} · {u.department}
                </MenuItem>
              ))}
            </Select>
            <Button variant="contained" disabled={!selected || devLogin.isPending} onClick={() => devLogin.mutate(selected)}>
              시작하기
            </Button>
          </Stack>
        )}
      </Paper>
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
