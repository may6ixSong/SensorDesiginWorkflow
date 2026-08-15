import { Box } from '@mui/material';
import { UserDto } from '@/types/domain';
import { T } from '@/theme/tokens';

/**
 * 목업 av(u,s) 그대로 — 사용자 색상 배경 + 이름의 두 번째 글자.
 * (한국 이름 기준: 김선우 → "선")
 */
export function UserAvatar({ user, size = 26 }: { user?: UserDto | null; size?: number }) {
  const label = user?.name ? user.name.slice(1, 2) || user.name.slice(0, 1) : '?';
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
        fontSize: size * 0.42,
        background: user?.color || T.dm,
        lineHeight: 1,
      }}
    >
      {label}
    </Box>
  );
}
