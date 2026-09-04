import { Stack, Typography } from '@mui/material';

/**
 * ADSSO 인증은 통과했지만 사내 플랫폼(USER_GROUP_API)에 등록되지 않은 계정이면 여기서
 * 막는다(사용자 요청) — 예전엔 이 경우 자동으로 플랫폼 사용자로 등록하고 기본값
 * (Developer/en/light)으로 앱에 들여보냈지만, 플랫폼에 없는 사람은 권한이 아예 없어야
 * 하므로 Home을 포함해 어떤 라우트도 못 보게 LoginGate(App.tsx)에서 여기로만 보낸다.
 */
export function AccessDeniedPage() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }} spacing={1}>
      <Typography variant="h6">Access denied</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, textAlign: 'center' }}>
        Your account isn't registered on this platform yet. Ask an administrator to add you.
      </Typography>
    </Stack>
  );
}
