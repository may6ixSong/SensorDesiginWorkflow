import { Box } from '@mui/material';
import { CanvasNode, latA, latR, hasW, stOf, vstr, fmtAt } from '@/lib/canvasModel';
import { PhaseRef, UserDto } from '@/types/domain';
import { departmentName } from '@/shared/constants/departments';
import { DocIcon, Icon } from '@/components/common/Icon';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  d: CanvasNode;
  phase?: PhaseRef;
  usersById: Map<string, UserDto>;
  edit: boolean;
  canEdit: boolean;
  isSel: boolean;
  onHl: boolean;
  dimLink: boolean;
  hasHl: boolean;
  onOpen: (id: string) => void;
  onPinClick: (id: string, e: React.MouseEvent) => void;
  onGripDown: (id: string, e: React.PointerEvent) => void;
  linkActive: boolean;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

/** 목업 nodeH() — 산출물 블록 */
export function DeliverableNode({
  d, phase, usersById, edit, canEdit, isSel, onHl, dimLink, hasHl,
  onOpen, onPinClick, onGripDown, linkActive, registerRef,
  onPointerDown, onPointerMove, onPointerUp, onClick,
}: Props) {
  const st = stOf(d);
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const last = latA(d);
  const compact = d.h < 96;
  const col = d.net === 'HPC' ? T.hp : d.type === 'excel' ? T.tl : T.bl;

  return (
    <Box
      ref={(el: HTMLDivElement | null) => registerRef(d.id, el)}
      data-bid={d.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      // 위치/크기는 style prop으로 — 드래그마다 emotion 클래스가 새로 생기는 것을 막고,
      // React가 DOM을 직접 갱신하므로 취소 시 이전 위치로 확실히 되돌아간다.
      style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
      sx={{
        position: 'absolute',
        borderRadius: '10px',
        background: T.sf,
        border: `1px solid ${isSel ? T.tl : dimLink ? T.vi : T.ln2}`,
        boxShadow: isSel ? `0 0 0 3px ${T.tl2}, ${T.sm}` : T.sm,
        overflow: 'visible',
        padding: '8px 9px 7px',
        outline: onHl && hasHl ? `2px solid ${T.vi}` : 'none',
        outlineOffset: onHl && hasHl ? '2px' : 0,
        cursor: edit && canEdit ? 'grab' : 'pointer',
        touchAction: 'none',
        transition: edit ? 'none' : 'box-shadow .15s, transform .15s, border-color .14s',
        '&:hover': edit ? {} : { transform: 'translateY(-2px)', boxShadow: T.sl, borderColor: T.ln3 },
        '&::before': {
          content: '""', position: 'absolute', top: 7, left: 7, width: 4, height: 4,
          borderRadius: '50%', background: T.ln3,
        },
      }}
    >
      {!edit && isSel && (
        <Box
          component="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}
          sx={{
            position: 'absolute', left: '50%', top: -32, transform: 'translateX(-50%)',
            display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
            background: T.tx, color: '#fff', fontSize: 11.5, fontWeight: 500,
            padding: '5px 11px', borderRadius: '7px', boxShadow: T.sl, zIndex: 40,
            cursor: 'pointer', border: 'none', fontFamily: 'inherit',
            animation: 'acroPop .16s ease-out',
            '&:hover': { background: '#000' },
            '&::after': {
              content: '""', position: 'absolute', left: '50%', bottom: -4, width: 8, height: 8,
              background: T.tx, transform: 'translateX(-50%) rotate(45deg)',
            },
          }}
        >
          <Icon name="expand" /> Details
        </Box>
      )}

      <Box
        component="span"
        sx={{
          position: 'absolute', top: 0, right: 0, fontFamily: FONT_MONO, fontSize: 8,
          letterSpacing: '.08em', padding: '2px 7px 3px', borderBottomLeftRadius: '8px',
          background: d.net === 'HPC' ? T.hp2 : T.sf3,
          color: d.net === 'HPC' ? T.hp : T.dm,
        }}
      >
        {d.net}
      </Box>

      {/* pin (좌: 입력, 우: 연결 시작) */}
      <Box
        sx={{
          position: 'absolute', top: '50%', left: -6, width: 12, height: 12, mt: '-6px',
          borderRadius: '50%', background: dimLink ? T.vi : T.sf,
          border: `2px solid ${dimLink ? T.vi : T.ln3}`, transition: '.12s', zIndex: 4,
        }}
      />
      {edit && (
        <>
          <Box
            data-pin={d.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onPinClick(d.id, e)}
            sx={{
              position: 'absolute', top: '50%', right: -6, width: 12, height: 12, mt: '-6px',
              borderRadius: '50%', transition: '.12s', zIndex: 4, cursor: 'crosshair',
              background: linkActive ? T.tl : T.sf,
              border: `2px solid ${linkActive ? T.tl : T.ln3}`,
              transform: linkActive ? 'scale(1.3)' : 'none',
              '&:hover': { background: T.tl, borderColor: T.tl, transform: 'scale(1.3)' },
            }}
          />
          <Box
            data-grip={d.id}
            onPointerDown={(e) => onGripDown(d.id, e)}
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
        </>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '7px', pl: '8px' }}>
        <Box component="span" sx={{ color: col, flex: '0 0 auto' }}>
          <DocIcon type={d.type} />
        </Box>
        <Box
          sx={{
            fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, flex: 1, overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}
        >
          {d.name}
        </Box>
        {d.seriesTotal > 1 && (
          <Box
            component="span"
            title={`Release schedule ${d.seriesIdx}/${d.seriesTotal}`}
            sx={{
              fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600, padding: '1px 5px',
              borderRadius: '9px', background: T.vi2, color: T.vi, border: `1px solid ${T.vi3}`,
              flex: '0 0 auto', mt: '1px',
            }}
          >
            {d.seriesIdx}/{d.seriesTotal}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          fontSize: 9.5, color: T.dm2, margin: '6px 0', pl: '8px', fontFamily: FONT_MONO,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {phase ? phase.key : '-'} · {last ? usersById.get(last.by)?.name ?? '—' : '—'} ·{' '}
        {last ? fmtAt(last.at).slice(5, 16) : 'No updates'}
      </Box>

      {!compact && (
        <Box sx={{ display: 'flex', gap: '4px', pl: '8px', flexWrap: 'wrap' }}>
          <Chip c={st.c} bg={st.bg} bd={st.bd}>{st.lb}</Chip>
          {rel ? (
            <Chip c={T.tl} bg={T.tl2} bd={T.tl3}>{vstr(rel)}</Chip>
          ) : (
            <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>No release</Chip>
          )}
          {canEdit && work && <Chip c={T.am} bg={T.am2} bd={T.am3}>In progress {vstr(work)}</Chip>}
          {d.recvDept && <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>{departmentName(d.recvDept)}</Chip>}
        </Box>
      )}
    </Box>
  );
}

function Chip({ c, bg, bd, children }: { c: string; bg: string; bd: string; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: FONT_MONO, fontSize: 8.5, padding: '1px 4px', borderRadius: '5px',
        border: `1px solid ${bd}`, background: bg, color: c, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}
