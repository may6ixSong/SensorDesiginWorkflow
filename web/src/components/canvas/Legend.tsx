import { Box } from '@mui/material';
import { T } from '@/theme/tokens';

/**
 * 캔버스 우하단 범례 — publish 3상태(설계서 03장 §2.2).
 *
 * ★ 용어는 **publish**다. workflow가 부서에 전달하는 release와 다른 층위라, 여기서
 *   'Released'를 쓰면 두 개념이 섞인다(설계서 04장 §8).
 */
export function Legend() {
  const items = [
    { c: T.dm2, l: 'Not published' },
    { c: T.pr, l: 'New since last release' },
    { c: T.ok, l: 'Published' },
  ];
  return (
    <Box
      sx={{
        position: 'absolute', right: 14, bottom: 14, zIndex: 10,
        background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '9px',
        padding: '7px 11px', boxShadow: T.shSm,
        display: 'flex', gap: '11px', fontSize: 11, color: T.dm, alignItems: 'center',
      }}
    >
      {items.map((it) => (
        <Box key={it.l} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Box component="i" sx={{ width: 8, height: 8, borderRadius: '3px', background: it.c, display: 'block' }} />
          {it.l}
        </Box>
      ))}
    </Box>
  );
}
