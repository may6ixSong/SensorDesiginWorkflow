import { useTranslation } from 'react-i18next';
import { usePlatformAuth } from '@/app/providers/AuthProvider';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { updatePlatformUserInfo } from '@/service/user-service';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';

/**
 * Light/dark switch. Always flips the local theme immediately (SIREN has no
 * profile-driven rendering the way SSM does); when a platform identity is
 * available, additionally persists the choice via USER_GROUP_API so it
 * survives across the platform's other apps.
 */
export function ThemeTogglePlatform() {
  const { t } = useTranslation();
  const { mode, toggle } = useThemeMode();
  const { platformUser, updatePlatformPrefs } = usePlatformAuth();
  const isDark = mode === 'dark';

  const onToggle = async () => {
    const next = isDark ? 'light' : 'dark';
    toggle();
    if (platformUser) {
      const ok = await updatePlatformUserInfo(platformUser.KnoxID, 'Theme', next);
      if (ok) updatePlatformPrefs('Theme', next);
    }
  };

  return (
    <HeaderIconButton
      icon={isDark ? 'moon' : 'sun'}
      label={isDark ? t('appShell.theme.toLight') : t('appShell.theme.toDark')}
      onClick={onToggle}
    />
  );
}
