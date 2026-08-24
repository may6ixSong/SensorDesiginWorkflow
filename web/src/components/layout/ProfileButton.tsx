import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { usePlatformAuth } from '@/app/providers/AuthProvider';
import { initials } from '@/components/common/Avatar';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { CURSOR_POINTER, T } from '@/theme/tokens';

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2} alignItems="baseline">
      <Typography sx={{ width: 100, fontSize: 12.5, color: T.dm }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value || '-'}</Typography>
    </Stack>
  );
}

/** Platform-identity avatar + name/dept, opens a read-only profile dialog. Right-most in the top bar. */
export function ProfileButton() {
  const { t, i18n } = useTranslation();
  const { platformUser } = usePlatformAuth();
  const { mode } = useThemeMode();
  const [open, setOpen] = useState(false);
  const isKo = i18n.language?.startsWith('ko');

  const name = (isKo ? platformUser?.Name : platformUser?.EnName) || platformUser?.KnoxID || 'User';
  const dept = (isKo ? platformUser?.Department : platformUser?.EnDepartment) || '';

  return (
    <>
      <Box
        component="button"
        onClick={() => setOpen(true)}
        sx={{
          ml: 0.5, px: 1, height: 34, borderRadius: '999px', display: 'flex', alignItems: 'center', gap: 1,
          color: T.tx, background: 'transparent', border: '1px solid transparent', cursor: CURSOR_POINTER,
          '&:hover': { background: T.sf3, borderColor: T.ln },
        }}
      >
        <Box
          sx={{
            width: 26, height: 26, borderRadius: '7px', display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', background: T.tl, flex: '0 0 auto',
          }}
        >
          {initials(name)}
        </Box>
        <Box sx={{ textAlign: 'left', display: { xs: 'none', sm: 'block' }, maxWidth: 140, overflow: 'hidden' }}>
          <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.1 }}>{name}</Typography>
          <Typography noWrap sx={{ fontSize: 10.5, color: T.dm, lineHeight: 1.1 }}>{dept}</Typography>
        </Box>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>{t('appShell.profile.title')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.25}>
            <ProfileRow label={t('appShell.profile.name')} value={name} />
            <ProfileRow label={t('appShell.profile.department')} value={dept} />
            <ProfileRow label={t('appShell.profile.group')} value={platformUser?.Group ?? '-'} />
            <ProfileRow label={t('appShell.profile.email')} value={platformUser?.Email ?? '-'} />
            <ProfileRow label={t('appShell.profile.language')} value={isKo ? '한국어' : 'English'} />
            <ProfileRow label={t('appShell.profile.theme')} value={mode} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} variant="outlined">
            {t('appShell.profile.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
