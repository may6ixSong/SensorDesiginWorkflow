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
  // DeliverableNode와 동일한 flow 하이라이트 규칙 — 켜져 있는데(hasHl) 이 메모는 그
  // 흐름에 안 걸려 있으면(!onHl, 메모는 edge가 없어 항상 그렇다) 살짝 흐리게 한다.
  const connected = onHl && hasHl;
  const unrelated = hasHl && !onHl;
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
        // DeliverableNode와 동일하게 — 선택된 블록을 자체 stacking context로 끌어올려서
        // 옆 블록의 hover/opacity가 만드는 stacking context에 가려지지 않게 한다.
        zIndex: isSel ? 20 : 'auto',
        borderRadius: '15px',
        padding: '15px 16px',
        background: `repeating-linear-gradient(135deg,${T.memoA} 0 13px,${T.memoB} 13px 26px)`,
        border: `1.5px dashed ${isSel ? T.tl : T.ln3}`,
        boxShadow: isSel ? `0 0 0 4px ${T.tl2}, ${T.sm}` : T.sm,
        color: T.dm,
        fontSize: 18,
        lineHeight: 1.5,
        cursor: edit ? 'grab' : 'default',
        touchAction: 'none',
        overflow: 'hidden',
        outline: connected ? `5px solid ${T.vi}` : 'none',
        outlineOffset: connected ? '4px' : 0,
        opacity: unrelated ? 0.6 : 1,
        transition: 'opacity .15s',
      }}
    >
      <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '.12em', color: T.dm2, display: 'block', mb: '7px' }}>
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
            position: 'absolute', right: 0, bottom: 0, width: 24, height: 24,
            cursor: 'nwse-resize', zIndex: 5, touchAction: 'none',
            '&::after': {
              content: '""', position: 'absolute', right: 4, bottom: 4, width: 12, height: 12,
              borderRight: `3px solid ${T.ln3}`, borderBottom: `3px solid ${T.ln3}`,
            },
            '&:hover::after': { borderColor: T.tl },
          }}
        />
      )}
    </Box>
  );
}
