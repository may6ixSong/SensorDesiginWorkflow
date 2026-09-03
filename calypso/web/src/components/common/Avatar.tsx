import { Box } from '@mui/material';
import { DirectoryUser } from '@/app/providers/DirectoryProvider';
import { T } from '@/theme/tokens';

/** "Sunwoo Kim" → "SK" — first letter of up to the first two space-separated words. */
export function initials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/** User avatar chip — background is the user's assigned color, label is their initials. */
export function UserAvatar({ user, size = 26 }: { user?: DirectoryUser | null; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '7px',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        color: '#fff',
        flex: '0 0 auto',
        fontSize: size * 0.38,
        background: user?.color || T.dm,
        lineHeight: 1,
      }}
    >
      {initials(user?.name)}
    </Box>
  );
}
