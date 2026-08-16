import { useThemeMode } from '@/theme/ThemeModeContext';
import { HeaderIconButton } from './HeaderIconButton';

/** Light/dark switch — rightmost of the header icon buttons, next to the user badge. */
export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === 'dark';
  return (
    <HeaderIconButton
      icon={isDark ? 'moon' : 'sun'}
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    />
  );
}
