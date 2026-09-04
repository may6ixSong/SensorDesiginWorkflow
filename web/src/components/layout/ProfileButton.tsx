import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useAuth } from '@/app/providers/AuthProvider';
import { initials } from '@/components/common/Avatar';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { SirenButton } from '@/components/common/SirenButton';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2} alignItems="baseline">
      <Typography sx={{ width: 100, fontSize: 12.5, color: T.dm }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value || '-'}</Typography>
    </Stack>
  );
}

/**
 * Platform-identity avatar + name/dept, opens a profile dialog. Right-most in the top bar.
 *
 * Admin-only from here on (사용자 요청): non-admin의 클릭은 아예 아무 것도 하지 않는다 —
 * 예전엔 누구나 열어 읽기 전용 프로필을 봤지만, 이 자리가 이제 사용자 시뮬레이터(§13)의
 * 입구를 겸하게 되면서 Admin 전용 진입점으로 좁혔다. 시뮬레이션 중엔 이름/부서 자체가
 * 대상 사용자 것으로 바뀌므로(AuthProvider.startSimulation), 뱃지 텍스트 색을 amber로
 * 바꿔 "지금 보고 있는 게 내 화면이 아니다"를 착각하지 않게 표시한다(§13.3 규칙 5).
 */
export function ProfileButton() {
  const { i18n } = useTranslation();
  const {
    user, isAdmin, isSimulating, startSimulation, stopSimulation,
  } = useAuth();
  const { mode } = useThemeMode();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [applying, setApplying] = useState(false);
  const isKo = i18n.language?.startsWith('ko');

  const name = (isKo ? user?.Name : user?.EnName) || user?.KnoxID || 'User';
  const dept = (isKo ? user?.Department : user?.EnDepartment) || '';
  const badgeColor = isSimulating ? T.am : T.tx;

  const apply = async () => {
    if (!target.trim()) return;
    setApplying(true);
    try {
      await startSimulation(target.trim());
      // 시점이 바뀌면 캐시된 응답은 전부 다른 사람 기준이라 버린다.
      qc.clear();
      setTarget('');
      setOpen(false);
    } catch (e: any) {
      toast(e?.message ?? 'Could not simulate that user');
    } finally {
      setApplying(false);
    }
  };

  const stop = () => {
    stopSimulation();
    qc.clear();
  };

  return (
    <>
      <Box
        component="button"
        onClick={() => isAdmin && setOpen(true)}
        sx={{
          ml: 0.5, px: 1, height: 34, borderRadius: '999px', display: 'flex', alignItems: 'center', gap: 1,
          color: badgeColor, background: 'transparent', border: '1px solid transparent',
          cursor: isAdmin ? CURSOR_POINTER : 'default',
          ...(isAdmin ? { '&:hover': { background: T.sf3, borderColor: T.ln } } : {}),
        }}
      >
        <Box
          sx={{
            width: 26, height: 26, borderRadius: '7px', display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', background: isSimulating ? T.am : T.tl, flex: '0 0 auto',
          }}
        >
          {initials(name)}
        </Box>
        <Box sx={{ textAlign: 'left', display: { xs: 'none', sm: 'block' }, maxWidth: 140, overflow: 'hidden' }}>
          <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1, color: badgeColor }}>{name}</Typography>
          <Typography noWrap sx={{ fontSize: 10.5, color: isSimulating ? T.am : T.dm, lineHeight: 1.1 }}>{dept}</Typography>
        </Box>
      </Box>

      {isAdmin && (
        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 700 }}>Profile</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.25}>
              <ProfileRow label="Name" value={name} />
              <ProfileRow label="Department" value={dept} />
              <ProfileRow label="Group" value={user?.Group ?? '-'} />
              <ProfileRow label="Language" value={isKo ? '한국어' : 'English'} />
              <ProfileRow label="Theme" value={mode} />
            </Stack>

            <Box sx={{ mt: '18px', pt: '16px', borderTop: `1px solid ${T.ln}` }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: '9px' }}>User simulation</Typography>
              <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Box
                  component="input"
                  value={target}
                  placeholder="KnoxID"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTarget(e.target.value)}
                  sx={{
                    flex: 1, height: 34, px: '10px',
                    border: `1px solid ${T.ln}`, borderRadius: '7px',
                    background: T.sf, color: T.tx, fontSize: 13, outline: 'none',
                    '&:focus': { borderColor: T.tl },
                  }}
                />
                <SirenButton variant="primary" disabled={applying || !target.trim()} onClick={apply}>
                  View as
                </SirenButton>
              </Box>
              {isSimulating && (
                <Box
                  sx={{
                    mt: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    p: '9px 12px', borderRadius: '7px', border: `1px solid ${T.am2}`, background: T.am3,
                  }}
                >
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, color: T.am }}>
                    Viewing as {user?.KnoxID}
                  </Box>
                  <SirenButton onClick={stop}>Stop</SirenButton>
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} variant="outlined">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
