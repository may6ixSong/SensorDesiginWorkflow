import { useEffect, useRef } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useThemeMode } from '@/theme/ThemeModeContext';

/**
 * One-time alignment of the local theme toggle (ThemeModeContext, which drives
 * the pre-paint no-flash script + CSS vars) to the signed-in user's saved
 * preference, once identity resolution settles. No-ops when USER_GROUP_API
 * didn't return a Theme (dev / unreachable) — the local toggle's own
 * default/localStorage value wins.
 */
export function PlatformPreferencesSync() {
  const { user, loginSuccess } = useAuth();
  const { mode, setMode } = useThemeMode();
  const aligned = useRef(false);

  useEffect(() => {
    if (!loginSuccess || !user?.Theme || aligned.current) return;
    aligned.current = true;
    if (user.Theme !== mode) setMode(user.Theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSuccess, user]);

  return null;
}
