import { Box } from '@mui/material';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { Icon } from './Icon';
import { T } from '@/theme/tokens';

/** Light/dark switch — sits left of the user badge in the top bar. */
export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === 'dark';
  return (
    <Box
      component="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      sx={{
        display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '8px',
        background: T.sf, border: `1px solid ${T.ln2}`, color: T.dm, cursor: 'pointer',
        transition: '.14s', flex: '0 0 auto',
        '&:hover': { background: T.sf3, color: T.tx },
      }}
    >
      <Icon name={isDark ? 'moon' : 'sun'} size={15} />
    </Box>
  );
}
