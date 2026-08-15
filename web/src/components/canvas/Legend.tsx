import { Box } from '@mui/material';
import { T } from '@/theme/tokens';

/** 목업 우하단 범례 — 미제출 / 작업중 / Released */
export function Legend() {
  const items = [
    { c: T.dm2, l: '미제출' },
    { c: T.am, l: '작업중' },
    { c: T.tl, l: 'Released' },
  ];
  return (
    <Box
      sx={{
        position: 'absolute', right: 14, bottom: 14, zIndex: 10,
        background: T.sf, border: `1px solid ${T.ln2}`, borderRadius: '9px',
        padding: '7px 11px', boxShadow: T.sm,
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
