import { useState } from 'react';
import { Languages } from 'lucide-react';
import { Popover, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useAuth, OFFLINE_LANG_KEY, type Language } from '@/app/providers/AuthProvider';
import { updateUserInfo } from '@/service/user-service';
import { isOnLine } from '@/utils/helper';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { T } from '@/theme/tokens';
import { useTranslation } from 'react-i18next';

/** Language switch — icon and toggle/persist logic match SSM_WEB's TopAppBar onChangeLanguage exactly. */
export function LanguagePopover() {
  const { i18n, t } = useTranslation();
  const { user, updateUserPrefs } = useAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);
  const lang = (user?.Language ?? 'en') as Language;
  const onLine = isOnLine();

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    // Capture currentTarget synchronously — the DOM nulls it out once the
    // event finishes propagating, before a functional setState updater runs.
    const target = e.currentTarget;
    setAnchor((prev) => (prev ? null : target));
  };
  const close = () => setAnchor(null);

  const onChangeLanguage = async (next: Language) => {
    if (next === lang) return;

    if (!onLine) {
      // No backend offline: persist the explicit choice locally so it survives
      // restarts (AuthProvider reads OFFLINE_LANG_KEY on boot).
      localStorage.setItem(OFFLINE_LANG_KEY, next);
      i18n.changeLanguage(next);
      updateUserPrefs('Language', next);
      close();
      return;
    }

    const result = await updateUserInfo(user?.KnoxID ?? '', 'Language', next);
    if (result) {
      i18n.changeLanguage(next);
      updateUserPrefs('Language', next);
      close();
    }
  };

  return (
    <>
      <HeaderIconButton
        iconElement={<Languages size={15} />}
        label={t('appShell.language.tooltip')}
        onClick={toggle}
        active={open}
      />

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, p: 0.75, border: `1px solid ${T.ln}`, borderRadius: 2 } }}
      >
        <ToggleButtonGroup size="small" exclusive sx={{ height: 30 }}>
          <ToggleButton value="ko" disabled={lang === 'ko'} onClick={() => onChangeLanguage('ko')} sx={{ px: 1.2, fontWeight: 700, fontSize: 12 }}>
            {t('appShell.language.ko')}
          </ToggleButton>
          <ToggleButton value="en" disabled={lang === 'en'} onClick={() => onChangeLanguage('en')} sx={{ px: 1.2, fontWeight: 700, fontSize: 12 }}>
            {t('appShell.language.en')}
          </ToggleButton>
        </ToggleButtonGroup>
      </Popover>
    </>
  );
}
