import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useAuth } from '@/app/providers/AuthProvider';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { initials } from '@/components/common/Avatar';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
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
 * 입구를 겸하게 되면서 Admin 전용 진입점으로 좁혔다. 이 게이팅과 시뮬레이터 컨트롤은
 * 반드시 **isRealAdmin**(실제 호출자 기준)으로 한다 — 지금 화면에 보이는 isAdmin은
 * 시뮬레이션 중이면 대상 사용자 기준으로 바뀌므로, 그걸로 게이팅하면 Admin이 non-admin을
 * 시뮬레이션하는 순간 자기 Stop 버튼을 잃어버린다.
 *
 * 시뮬레이션을 걸거나 끌 때마다 Home으로 리다이렉트한다(사용자 요청) — 지금 열려 있던
 * 페이지의 로컬 상태(캔버스 store 등)가 이전 신원 기준으로 남아있을 수 있어서, React
 * Query 캐시를 비우는 것만으로는 화면이 완전히 새 신원 기준으로 다시 시작한다는 보장이
 * 없다. 페이지 전체를 새로 마운트시켜야 확실하다.
 */
export function ProfileButton() {
  const { i18n } = useTranslation();
  const {
    user, isRealAdmin, isSimulating, startSimulation, stopSimulation,
  } = useAuth();
  const { mode } = useThemeMode();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const isKo = i18n.language?.startsWith('ko');

  const name = (isKo ? user?.Name : user?.EnName) || user?.KnoxID || 'User';
  const dept = (isKo ? user?.Department : user?.EnDepartment) || '';
  const badgeColor = isSimulating ? T.am : T.tx;

  const apply = async (knoxId: string) => {
    setSearchOpen(false);
    setApplying(true);
    try {
      await startSimulation(knoxId);
      // 시점이 바뀌면 캐시된 응답은 전부 다른 사람 기준이라 버린다.
      qc.clear();
      setOpen(false);
      navigate('/');
    } catch (e: any) {
      toast(e?.message ?? 'Could not simulate that user');
    } finally {
      setApplying(false);
    }
  };

  const stop = () => {
    stopSimulation();
    qc.clear();
    setOpen(false);
    navigate('/');
  };

  return (
    <>
      <Box
        component="button"
        onClick={() => isRealAdmin && setOpen(true)}
        sx={{
          ml: 0.5, px: 1, height: 34, borderRadius: '999px', display: 'flex', alignItems: 'center', gap: 1,
          color: badgeColor, background: 'transparent', border: '1px solid transparent',
          cursor: isRealAdmin ? CURSOR_POINTER : 'default',
          ...(isRealAdmin ? { '&:hover': { background: T.sf3, borderColor: T.ln } } : {}),
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

      {isRealAdmin && (
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
              <SirenButton variant="primary" disabled={applying} onClick={() => setSearchOpen(true)}>
                <Icon name="search" /> View as…
              </SirenButton>
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

            {/*
              Service Manage(Hub 레지스트리, §13.4)로 가는 진입점. 예전엔 상단바에 별도
              "Admin" 링크가 있었지만 여기로 옮겼다(사용자 요청). 시뮬레이션 중에는 그
              대상의 권한으로 레지스트리를 고칠 수 없어야 하므로 비활성화한다(§13.3 규칙 2) —
              라우트 진입 자체도 ServiceManagePage가 한 번 더 막는다.
            */}
            <Box sx={{ mt: '18px', pt: '16px', borderTop: `1px solid ${T.ln}` }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: '9px' }}>Service Manage</Typography>
              <SirenButton
                disabled={isSimulating}
                onClick={() => { setOpen(false); navigate('/service-manage'); }}
              >
                <Icon name="expand" /> Open
              </SirenButton>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} variant="outlined">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {searchOpen && (
        <UserSearchDialog
          title="View as — pick a user"
          onClose={() => setSearchOpen(false)}
          onConfirm={(knoxId) => apply(knoxId)}
        />
      )}
    </>
  );
}
