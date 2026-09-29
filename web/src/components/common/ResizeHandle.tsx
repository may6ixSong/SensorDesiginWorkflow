import { PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mui/material';
import { T } from '@/theme/tokens';

/**
 * 좌우 패널 사이의 세로 손잡이 — useResizableSidePanel과 짝이다. 끄는 동안에는 화면 전체에 투명 막을
 * 깔아 iframe이 포인터를 가져가지 못하게 한다.
 */
export function ResizeHandle({ onPointerDown, dragging }: { onPointerDown: (e: ReactPointerEvent) => void; dragging: boolean }) {
  return (
    <>
      <Box
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        sx={{
          flex: '0 0 6px', width: 6, cursor: 'col-resize', position: 'relative', zIndex: 1,
          background: dragging ? T.prLine : 'transparent',
          borderLeft: `1px solid ${T.ln}`,
          transition: 'background .15s',
          '&:hover': { background: T.prSoft },
        }}
      />
      {dragging && <Box sx={{ position: 'fixed', inset: 0, zIndex: 2000, cursor: 'col-resize' }} />}
    </>
  );
}
