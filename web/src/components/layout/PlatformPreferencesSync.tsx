import { useEffect, useRef } from 'react';
import { usePlatformAuth } from '@/app/providers/AuthProvider';
import { useThemeMode } from '@/theme/ThemeModeContext';

/**
 * One-time alignment of the local theme toggle (ThemeModeContext, which drives
 * the pre-paint no-flash script + CSS vars) to the signed-in platform user's
 * saved preference, once identity resolution settles. No-ops when the
 * platform's USER_GROUP_API didn't return a Theme (dev / unreachable) —
 * the local toggle's own default/localStorage value wins.
 */
export function PlatformPreferencesSync() {
  const { platformUser, ready } = usePlatformAuth();
  const { mode, setMode } = useThemeMode();
  const aligned = useRef(false);

  useEffect(() => {
    if (!ready || !platformUser || aligned.current) return;
    aligned.current = true;
    if (platformUser.Theme && platformUser.Theme !== mode) setMode(platformUser.Theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, platformUser]);

  return null;
}
