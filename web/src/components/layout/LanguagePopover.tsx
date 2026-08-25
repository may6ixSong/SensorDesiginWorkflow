import { useState } from 'react';
import { Languages } from 'lucide-react';
import { Popover, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useAuth, type Language } from '@/app/providers/AuthProvider';
import { updateUserInfo } from '@/service/user-service';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';
import { T } from '@/theme/tokens';
import { useTranslation } from 'react-i18next';

/** Language names as shown in the toggle — always in their own script, never translated. */
const LANGUAGE_NAMES = { ko: '한국어', en: 'English' } as const;

/** Language switch — icon and toggle/persist logic match SSM_WEB's TopAppBar onChangeLanguage exactly. */
export function LanguagePopover() {
  const { i18n } = useTranslation();
  const { user, updateUserPrefs } = useAuth();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);
  const lang = (user?.Language ?? 'en') as Language;

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    // Capture currentTarget synchronously — the DOM nulls it out once the
    // event finishes propagating, before a functional setState updater runs.
    const target = e.currentTarget;
    setAnchor((prev) => (prev ? null : target));
  };
  const close = () => setAnchor(null);

  const onChangeLanguage = async (next: Language) => {
    if (next === lang) return;

    // Always apply immediately — the toggle must never depend on a network
    // round-trip succeeding. USER_GROUP_API is blank/unreachable in dev (and
    // possibly early production), so persistence below is best-effort only.
    i18n.changeLanguage(next);
    updateUserPrefs('Language', next);
    close();

    void updateUserInfo(user?.KnoxID ?? '', 'Language', next);
  };

  return (
    <>
      <HeaderIconButton
        iconElement={<Languages size={20} />}
        label="Language"
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
            {LANGUAGE_NAMES.ko}
          </ToggleButton>
          <ToggleButton value="en" disabled={lang === 'en'} onClick={() => onChangeLanguage('en')} sx={{ px: 1.2, fontWeight: 700, fontSize: 12 }}>
            {LANGUAGE_NAMES.en}
          </ToggleButton>
        </ToggleButtonGroup>
      </Popover>
    </>
  );
}
