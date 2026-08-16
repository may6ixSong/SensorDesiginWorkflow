import { Stack, Typography } from '@mui/material';

/** 권한 없음 안내 (설계서 7.1 라우팅). IP에 Edit/View 권한이 없으면 목록에 노출되지 않고 여기로 온다. */
export function NoAccessPage() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }} spacing={1}>
      <Typography variant="h6">No access</Typography>
      <Typography variant="body2" color="text.secondary">
        You don't have Edit or View access to this IP. Ask an administrator for access.
      </Typography>
    </Stack>
  );
}
