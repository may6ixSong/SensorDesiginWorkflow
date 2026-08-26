import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { CanvasNode, getPW, todayX } from '@/lib/canvasModel';
import { DAY_MS, dayMs, shortDate } from '@/lib/schedule';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  phases: WorkflowPhase[];
  phasePW: Record<string, number>;
  nodes: CanvasNode[];
  z: number;
  panX: number;
  edit: boolean;
  onPhaseClick: (phaseId: string) => void;
  onResizeStart: (phaseId: string, e: React.PointerEvent) => void;
}

/**
 * 이 workflow의 일정 스텝퍼 — 화살표(clip-path) 셀 하나가 phase 한 칸이다.
 *
 * 여기 뜨는 이름(KO / ML1 / AR …)은 이 workflow가 스스로 정한 짧은 표기일 뿐,
 * 과제 마일스톤이 아니다 — 그래서 "Milestone"이라는 단어를 쓰지 않는다.
 * 칸끼리 일정이 겹칠 수 있고, 그래도 좌→우 순서는 시작일 오름차순 그대로다.
 *
 * 캔버스와 정확히 같은 좌표계를 유지하는 방식이 핵심이다:
 *  - 트랙은 translateX(panX)만 적용하고,
 *  - 각 셀의 폭은 getPW(p) * z 로 미리 곱해둔다.
 * 캔버스는 반대로 translateX(panX) scale(z)로 통째로 스케일하고 레인 폭은 원본값을 쓴다.
 * 두 방식의 결과 픽셀 폭이 같아지므로 phase와 블록이 어긋나지 않는다.
 */
export function PhaseStepper({
  phases, phasePW, nodes, z, panX, edit, onPhaseClick, onResizeStart,
}: Props) {
  const now = Date.now();
  const tx = todayX(phases, phasePW, new Date(now));
  const todayLeft = tx !== null ? tx * z + panX : null;
  /** 앞 칸보다 일찍 시작하는 칸 = 앞 칸과 일정이 겹친다는 뜻 — 셀에 표시해 준다. */
  const overlaps = phases.map((p, i) => i > 0 && dayMs(p.start) < dayMs(phases[i - 1].end));

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
          const cnt = nodes.filter((d) => d.phase === p.id).length;
          const st = dayMs(p.start);
          const en = dayMs(p.end) + DAY_MS;
          const past = en < now;
          const cur = st <= now && now <= en;
          const prog = cur ? Math.min(1, (now - st) / (en - st)) : past ? 1 : 0;
          const pw = getPW(phasePW, p.id) * z;

          return (
            <Box
              key={p.id}
              onClick={(e) => {
                if ((e.target as HTMLElement).dataset.phresize !== undefined) return;
                e.stopPropagation();
                onPhaseClick(p.id);
              }}
              sx={{
                position: 'relative',
                display: 'inline-flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: i === 0 ? '8px 22px 8px 18px' : '8px 22px 8px 28px',
                background: cur ? T.tl2 : past ? T.sf2 : T.sf,
                border: `1px solid ${T.ln}`,
                textAlign: 'left',
                transition: 'background .15s',
                flex: `0 0 ${pw}px`,
                width: `${pw}px`,
                minWidth: `${pw}px`,
                overflow: 'hidden',
                cursor: CURSOR_POINTER,
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, letterSpacing: '.05em', color: cur ? T.tl : past ? T.dm : T.tx }}>
                  {p.name}
                </Box>
                {overlaps[i] && (
                  <Box
                    component="span"
                    title="This phase overlaps the previous one — that's allowed; lanes stay ordered by start date."
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 8, fontWeight: 700, letterSpacing: '.06em',
                      color: T.vi, background: T.vi2, border: `1px solid ${T.vi3}`,
                      borderRadius: '999px', padding: '0 5px',
                    }}
                  >
                    OVERLAP
                  </Box>
                )}
              </Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: T.dm2, margin: '2px 0 0' }}>
                {shortDate(p.start)} → {shortDate(p.end)}
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
                    onPointerDown={(e) => onResizeStart(p.id, e)}
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

        {!phases.length && (
          <Box sx={{ padding: '14px 18px', fontSize: 12, color: T.dm2 }}>
            This workflow has no schedule yet — add phases from “Edit phases”.
          </Box>
        )}
      </Box>
    </Box>
  );
}
