import { Box } from '@mui/material';
import { CanvasMemo } from '@/lib/canvasModel';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  n: CanvasMemo;
  edit: boolean;
  isSel: boolean;
  onHl: boolean;
  hasHl: boolean;
  onGripDown: (id: string, e: React.PointerEvent) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/** 목업 memoH() — 버전 관리 없는 메모 블록 */
export function MemoBlock({
  n, edit, isSel, onHl, hasHl, onGripDown, registerRef,
  onPointerDown, onPointerMove, onPointerUp,
}: Props) {
  return (
    <Box
      ref={(el: HTMLDivElement | null) => registerRef(n.id, el)}
      data-bid={n.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
      sx={{
        position: 'absolute',
        borderRadius: '10px',
        padding: '10px 11px',
        background: `repeating-linear-gradient(135deg,${T.memoA} 0 9px,${T.memoB} 9px 18px)`,
        border: `1px dashed ${isSel ? T.tl : T.ln3}`,
        boxShadow: isSel ? `0 0 0 3px ${T.tl2}, ${T.sm}` : T.sm,
        color: T.dm,
        fontSize: 12,
        lineHeight: 1.5,
        cursor: edit ? 'grab' : 'default',
        touchAction: 'none',
        overflow: 'hidden',
        outline: onHl && hasHl ? `2px solid ${T.vi}` : 'none',
        outlineOffset: onHl && hasHl ? '2px' : 0,
      }}
    >
      <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 8, letterSpacing: '.12em', color: T.dm2, display: 'block', mb: '5px' }}>
        MEMO · No version history
      </Box>
      <Box sx={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {n.text}
      </Box>
      {edit && (
        <Box
          data-grip={n.id}
          onPointerDown={(e) => onGripDown(n.id, e)}
          sx={{
            position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
            cursor: 'nwse-resize', zIndex: 5, touchAction: 'none',
            '&::after': {
              content: '""', position: 'absolute', right: 3, bottom: 3, width: 8, height: 8,
              borderRight: `2px solid ${T.ln3}`, borderBottom: `2px solid ${T.ln3}`,
            },
            '&:hover::after': { borderColor: T.tl },
          }}
        />
      )}
    </Box>
  );
}
