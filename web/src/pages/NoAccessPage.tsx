import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { R, T } from '@/theme/tokens';

/**
 * 권한 없음 안내.
 *
 * ★ **AppShell 안에 그린다.** 예전에는 껍데기 없이 문구 두 줄만 띄웠는데, 그러면 앱 바가
 *   통째로 사라져서 돌아갈 길이 없는 막다른 화면이 됐다(실측). 막는 것과 가두는 것은 다르다.
 * ★ 문구는 workflow를 특정하지 않는다 — 여기로 오는 경로가 workflow만이 아니다
 *   (Service Manage 같은 Admin 전용 화면도 여기로 보낸다).
 */
export function NoAccessPage() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <Box
        sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '64px 24px', textAlign: 'center',
        }}
      >
        <Box
          sx={{
            width: 60, height: 60, borderRadius: '50%', mb: '16px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: T.sf3, border: `1px solid ${T.ln}`, color: T.dm2,
            '& svg': { width: 26, height: 26 },
          }}
        >
          <Icon name="lock" />
        </Box>
        <Box sx={{ fontSize: 18, fontWeight: 700, mb: '7px' }}>No access</Box>
        <Box sx={{ fontSize: 13, color: T.dm2, lineHeight: 1.65, maxWidth: 380, mb: '20px' }}>
          You don't have access to this page. If you think you should, ask the owner of the
          workflow — or an administrator, for admin-only pages.
        </Box>
        <Box sx={{ display: 'flex', gap: '8px' }}>
          <SirenButton onClick={() => navigate(-1)}>Go back</SirenButton>
          <SirenButton variant="primary" onClick={() => navigate('/projects')}>
            <Icon name="grid" /> Project list
          </SirenButton>
        </Box>
        <Box sx={{ mt: '28px', fontSize: 11.5, color: T.dm2, borderRadius: `${R.sm}px` }}>
          Nothing was changed by this attempt.
        </Box>
      </Box>
    </AppShell>
  );
}
