import { Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthProvider';
import { SirenButton } from '@/components/common/SirenButton';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * ADSSO 인증은 통과했지만 사내 플랫폼(USER_GROUP_API)에 등록되지 않은 계정이면 여기서
 * 막는다(사용자 요청) — 예전엔 이 경우 자동으로 플랫폼 사용자로 등록하고 기본값
 * (Developer/en/light)으로 앱에 들여보냈지만, 플랫폼에 없는 사람은 권한이 아예 없어야
 * 하므로 Home을 포함해 어떤 라우트도 못 보게 LoginGate(App.tsx)에서 여기로만 보낸다.
 *
 * 시뮬레이션 중에도 대상이 미등록이면 여기로 온다(사용자 요청 — 나중에 만들 접근 신청
 * 페이지 등을 Admin이 그 신원으로 직접 확인할 수 있어야 하니 시뮬레이션 자체는 막지
 * 않고, 대신 실제 미등록 사용자와 똑같이 여기로 보낸다). 그 경우엔 AppShell이 없어서
 * 평소의 user badge로 시뮬레이션을 끌 수 없으므로, 여기에 탈출구를 하나 둔다.
 */
export function AccessDeniedPage() {
  const { isSimulating, stopSimulation } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const stop = () => {
    stopSimulation();
    qc.clear();
    navigate('/');
  };

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }} spacing={1.5}>
      <Typography variant="h6">Access denied</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, textAlign: 'center' }}>
        Your account isn't registered on this platform yet. Ask an administrator to add you.
      </Typography>

      {isSimulating && (
        <Stack alignItems="center" spacing={1} sx={{ mt: '18px', p: '12px 16px', borderRadius: '9px', border: `1px solid ${T.am2}`, background: T.am3 }}>
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: T.am }}>
            You're simulating this unregistered user.
          </Typography>
          <SirenButton onClick={stop}>Stop simulation</SirenButton>
        </Stack>
      )}
    </Stack>
  );
}
