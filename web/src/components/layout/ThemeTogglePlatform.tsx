import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useAuth, type Theme } from '@/app/providers/AuthProvider';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { updateUserInfo } from '@/service/user-service';
import { isOnLine } from '@/utils/helper';
import { HeaderIconButton } from '@/components/common/HeaderIconButton';

/**
 * Light/dark switch — icon and toggle/persist logic match SSM_WEB's TopAppBar
 * onToggleTheme exactly (icon shows the target of the click, not the current
 * mode). The actual visual flip still runs through SIREN's own ThemeModeContext
 * (pre-paint no-flash script + CSS vars), since SIREN — unlike SSM — has no
 * profile fetch to await before first paint.
 */
export function ThemeTogglePlatform() {
  const { mode, toggle } = useThemeMode();
  const { user, updateUserPrefs } = useAuth();
  const onLine = isOnLine();

  const onToggleTheme = async () => {
    const next: Theme = mode === 'dark' ? 'light' : 'dark';
    toggle();

    if (!onLine) {
      updateUserPrefs('Theme', next);
      return;
    }

    const result = await updateUserInfo(user?.KnoxID ?? '', 'Theme', next);
    if (result) {
      updateUserPrefs('Theme', next);
    }
  };

  return (
    <HeaderIconButton
      iconElement={mode === 'dark' ? <LightModeRoundedIcon sx={{ fontSize: 15 }} /> : <DarkModeRoundedIcon sx={{ fontSize: 15 }} />}
      label={mode === 'dark' ? 'Light mode' : 'Dark mode'}
      onClick={onToggleTheme}
    />
  );
}
