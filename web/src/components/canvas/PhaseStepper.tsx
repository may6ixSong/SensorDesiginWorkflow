import { Box } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { CanvasNode, getPW, todayX } from '@/lib/canvasModel';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  phases: PhaseRef[];
  phasePW: Record<string, number>;
  nodes: CanvasNode[];
  z: number;
  panX: number;
  edit: boolean;
  onPhaseClick: (phaseKey: string) => void;
  onResizeStart: (phaseKey: string, e: React.PointerEvent) => void;
}

/**
 * 목업 .st-shell / .st-track / .ph — 화살표(clip-path) 스텝퍼.
 *
 * 캔버스와 정확히 같은 좌표계를 유지하는 방식이 핵심이다:
 *  - 트랙은 translateX(panX)만 적용하고,
 *  - 각 셀의 폭은 getPW(p) * z 로 미리 곱해둔다.
 * 캔버스는 반대로 translateX(panX) scaleX(z)로 통째로 스케일하고 레인 폭은 원본값을 쓴다.
 * 두 방식의 결과 픽셀 폭이 같아지므로 Phase와 블록이 어긋나지 않는다.
 */
export function PhaseStepper({
  phases, phasePW, nodes, z, panX, edit, onPhaseClick, onResizeStart,
}: Props) {
  const today = new Date();
  const tx = todayX(phases, phasePW, today);
  const todayLeft = tx !== null ? tx * z + panX : null;

  return (
    <Box
      sx={{
        overflow: 'hidden',
        borderBottom: `1px solid ${T.ln}`,
        background: T.sf2,
        position: 'relative',
        flex: '0 0 auto',
      }}
    >
      {!edit && todayLeft !== null && (
        <>
          <Box sx={{ position: 'absolute', top: 0, bottom: 0, width: '1.5px', background: T.rd, opacity: 0.75, zIndex: 6, pointerEvents: 'none', left: `${todayLeft}px` }} />
          <Box
            sx={{
              position: 'absolute', top: 0, left: `${todayLeft}px`, transform: 'translateX(-50%)',
              background: T.rd, color: '#fff', fontFamily: FONT_MONO, fontSize: 9,
              letterSpacing: '.08em', padding: '2px 7px', borderRadius: '0 0 6px 6px',
              whiteSpace: 'nowrap', zIndex: 7, pointerEvents: 'none', boxShadow: T.ss,
            }}
          >
            TODAY
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', whiteSpace: 'nowrap', willChange: 'transform', transform: `translateX(${panX}px)` }}>
        {phases.map((p, i) => {
          const cnt = nodes.filter((d) => d.phase === p.key).length;
          const st = new Date(p.start);
          const en = new Date(p.end);
          const past = en < today;
          const cur = st <= today && today <= en;
          const prog = cur ? Math.min(1, (+today - +st) / (+en - +st)) : past ? 1 : 0;
          const pw = getPW(phasePW, p.key) * z;

          return (
            <Box
              key={p.key}
              onClick={(e) => {
                if ((e.target as HTMLElement).dataset.phresize !== undefined) return;
                e.stopPropagation();
                onPhaseClick(p.key);
              }}
              sx={{
                position: 'relative',
                display: 'inline-flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: i === 0 ? '8px 22px 8px 18px' : '8px 22px 8px 28px',
                background: cur ? 'linear-gradient(180deg,#d9f3ec,#eaf9f5)' : past ? T.sf2 : T.sf,
                border: `1px solid ${T.ln}`,
                textAlign: 'left',
                transition: 'background .15s',
                flex: `0 0 ${pw}px`,
                width: `${pw}px`,
                minWidth: `${pw}px`,
                overflow: 'hidden',
                cursor: 'pointer',
                clipPath:
                  i === 0
                    ? 'polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)'
                    : 'polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)',
                ...(cur
                  ? {
                      filter:
                        `drop-shadow(1.5px 0 0 ${T.tl}) drop-shadow(-1.5px 0 0 ${T.tl}) drop-shadow(0 1.5px 0 ${T.tl}) drop-shadow(0 -1.5px 0 ${T.tl})`,
                      zIndex: 3,
                    }
                  : {}),
                '&:hover': cur ? {} : { background: T.sf3 },
              }}
            >
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, letterSpacing: '.05em', color: cur ? T.tl : past ? T.dm : T.tx }}>
                {p.key}
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm, margin: '1px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.label}
              </Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 9, color: T.dm2 }}>
                {p.start.slice(2)} → {p.end.slice(2)}
              </Box>
              <Box sx={{ position: 'absolute', bottom: 7, right: 20, fontFamily: FONT_MONO, fontSize: 9, color: T.dm2 }}>
                {cnt}
              </Box>
              {prog > 0 && (
                <Box sx={{ position: 'absolute', left: 0, bottom: 0, height: '3px', background: T.tl, opacity: 0.5, width: `${(prog * 100).toFixed(1)}%` }} />
              )}
              {edit && (
                <>
                  <Box
                    data-phresize=""
                    onPointerDown={(e) => onResizeStart(p.key, e)}
                    sx={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 10,
                      cursor: 'col-resize', zIndex: 5, background: 'transparent',
                      transition: 'background .14s',
                      '&:hover': { background: 'rgba(12,154,131,.18)' },
                    }}
                  />
                  <Box sx={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px', background: T.ln2, pointerEvents: 'none', zIndex: 4 }} />
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
