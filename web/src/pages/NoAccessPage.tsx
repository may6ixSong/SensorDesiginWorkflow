import { Stack, Typography } from '@mui/material';

/** 권한 없음 안내 (설계서 7.1 라우팅). IP에 Edit/View 권한이 없으면 목록에 노출되지 않고 여기로 온다. */
export function NoAccessPage() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }} spacing={1}>
      <Typography variant="h6">접근 권한이 없습니다</Typography>
      <Typography variant="body2" color="text.secondary">
        이 IP에 대한 Edit 또는 View 권한이 없습니다. 관리자에게 권한을 요청하세요.
      </Typography>
    </Stack>
  );
}
