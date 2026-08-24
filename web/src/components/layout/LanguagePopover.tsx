import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Popover, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { usePlatformAuth } from '@/app/providers/AuthProvider';
import { updatePlatformUserInfo } from '@/service/user-service';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';

/** Language switch — icon button + popover, mirrors the theme toggle's placement/style. */
export function LanguagePopover() {
  const { t, i18n } = useTranslation();
  const { platformUser, updatePlatformPrefs } = usePlatformAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);
  const lang = i18n.language?.startsWith('ko') ? 'ko' : 'en';

  const onChange = async (next: 'ko' | 'en') => {
    if (next === lang) return;
    i18n.changeLanguage(next);
    setAnchor(null);
    if (platformUser) {
      const ok = await updatePlatformUserInfo(platformUser.KnoxID, 'Language', next);
      if (ok) updatePlatformPrefs('Language', next);
    }
  };

  return (
    <>
      <Box
        component="button"
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          // Capture currentTarget synchronously — see NoticeBell.tsx's toggle for why.
          const target = e.currentTarget;
          setAnchor((prev) => (prev ? null : target));
        }}
        aria-label={t('appShell.language.tooltip')}
        title={t('appShell.language.tooltip')}
        sx={{
          display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '8px',
          background: open ? T.sf3 : T.sf, color: open ? T.tx : T.dm,
          border: 'none', outline: 'none', cursor: CURSOR_POINTER, transition: '.14s',
          '&:hover': { background: T.sf3, color: T.tx },
        }}
      >
        <Icon name="globe" size={15} />
      </Box>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, p: 0.75, border: `1px solid ${T.ln}`, borderRadius: 2 } }}
      >
        <ToggleButtonGroup size="small" exclusive sx={{ height: 30 }}>
          <ToggleButton value="ko" selected={lang === 'ko'} onClick={() => onChange('ko')} sx={{ px: 1.2, fontWeight: 700, fontSize: 12 }}>
            {t('appShell.language.ko')}
          </ToggleButton>
          <ToggleButton value="en" selected={lang === 'en'} onClick={() => onChange('en')} sx={{ px: 1.2, fontWeight: 700, fontSize: 12 }}>
            {t('appShell.language.en')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Popover>
    </>
  );
}
