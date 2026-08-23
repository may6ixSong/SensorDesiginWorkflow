import { Box } from '@mui/material';
import { CanvasNode, latA, latR, hasW, stOf, vstr, fmtAt } from '@/lib/canvasModel';
import { IpBriefDto, PhaseRef, UserDto } from '@/types/domain';
import { departmentName } from '@/shared/constants/departments';
import { DocIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  d: CanvasNode;
  phase?: PhaseRef;
  usersById: Map<string, UserDto>;
  /** recvIpId가 가리키는 대상 IP(id/name/color) — "→ 다른 IP에 준다" 배지용. */
  recvIp?: IpBriefDto;
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
  d, phase, usersById, recvIp, edit, canEdit, isSel, onHl, dimLink, hasHl,
  onOpen, onPinClick, onGripDown, linkActive, registerRef,
  onPointerDown, onPointerMove, onPointerUp, onClick,
}: Props) {
  const st = stOf(d);
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const last = latA(d);
  const compact = d.h < 175;
  const col = d.net === 'HPC' ? T.hp : d.type === 'excel' ? T.tl : T.bl;
  const incoming = d.origin === 'incoming';
  // 받는 산출물은 "다른 IP가 준 것"이라는 정도만 드러내고 어느 IP인지는 캔버스
  // 블록에 표시하지 않는다 — 그래서 출처 IP 색상 대신 고정된 violet을 쓴다.
  const srcColor = T.vi;

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
        borderRadius: '15px',
        background: incoming ? T.vi2 : T.sf,
        border: `2px ${incoming ? 'dashed' : 'solid'} ${isSel ? T.tl : dimLink ? T.vi : incoming ? srcColor : T.ln2}`,
        boxShadow: isSel ? `0 0 0 4px ${T.tl2}, ${T.sm}` : T.sm,
        overflow: 'visible',
        padding: '12px 13px 10px',
        outline: onHl && hasHl ? `3px solid ${T.vi}` : 'none',
        outlineOffset: onHl && hasHl ? '3px' : 0,
        cursor: edit && canEdit && !incoming ? 'grab' : CURSOR_POINTER,
        touchAction: 'none',
        transition: edit ? 'none' : 'box-shadow .15s, transform .15s, border-color .14s',
        '&:hover': edit ? {} : { transform: 'translateY(-3px)', boxShadow: T.sl, borderColor: incoming ? srcColor : T.ln3 },
        '&::before': {
          content: '""', position: 'absolute', top: 10, left: 10, width: 6, height: 6,
          borderRadius: '50%', background: incoming ? srcColor : T.ln3,
        },
      }}
    >
      {!edit && isSel && (
        <Box
          component="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}
          sx={{
            position: 'absolute', left: '50%', top: -47, transform: 'translateX(-50%)',
            display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap',
            background: T.inv, color: '#fff', fontSize: 17, fontWeight: 500,
            padding: '7px 16px', borderRadius: '10px', boxShadow: T.sl, zIndex: 40,
            cursor: CURSOR_POINTER, border: 'none', fontFamily: 'inherit',
            animation: 'sirenPop .16s ease-out',
            '&:hover': { background: '#000' },
            '&::after': {
              content: '""', position: 'absolute', left: '50%', bottom: -6, width: 12, height: 12,
              background: T.inv, transform: 'translateX(-50%) rotate(45deg)',
            },
          }}
        >
          <Icon name="expand" size={17} /> Details
        </Box>
      )}

      {/* 어느 IP가 준 건지는 블록에 안 드러낸다(요청) — 상세(dialog)에서만 확인 가능.
          여기서는 "받은 산출물"이라는 것만 잠금 아이콘으로 드러낸다. */}
      {incoming && (
        <Box
          component="span"
          title="Received from another IP — open for details"
          sx={{
            position: 'absolute', top: 0, left: 0, padding: '4px 9px',
            borderBottomRightRadius: '12px', background: srcColor, color: '#fff',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Icon name="lock" size={13} />
        </Box>
      )}
      <Box
        component="span"
        sx={{
          position: 'absolute', top: 0, right: 0, fontFamily: FONT_MONO, fontSize: 14,
          letterSpacing: '.08em', padding: '3px 10px 4px', borderBottomLeftRadius: '12px',
          background: d.net === 'HPC' ? T.hp2 : T.sf3,
          color: d.net === 'HPC' ? T.hp : T.dm,
        }}
      >
        {d.net}
      </Box>

      {/* pin (좌: 입력, 우: 연결 시작) */}
      <Box
        sx={{
          position: 'absolute', top: '50%', left: -9, width: 18, height: 18, mt: '-9px',
          borderRadius: '50%', background: dimLink ? T.vi : T.sf,
          border: `3px solid ${dimLink ? T.vi : T.ln3}`, transition: '.12s', zIndex: 4,
        }}
      />
      {edit && (
        <>
          <Box
            data-pin={d.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onPinClick(d.id, e)}
            sx={{
              position: 'absolute', top: '50%', right: -9, width: 18, height: 18, mt: '-9px',
              borderRadius: '50%', transition: '.12s', zIndex: 4, cursor: 'crosshair',
              background: linkActive ? T.tl : T.sf,
              border: `3px solid ${linkActive ? T.tl : T.ln3}`,
              transform: linkActive ? 'scale(1.3)' : 'none',
              '&:hover': { background: T.tl, borderColor: T.tl, transform: 'scale(1.3)' },
            }}
          />
          {/* origin==='incoming'은 다른 IP 소유라 이 캔버스에서 리사이즈할 수 없다 — pin(연결)만 허용. */}
          {!incoming && (
            <Box
              data-grip={d.id}
              onPointerDown={(e) => onGripDown(d.id, e)}
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
        </>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', pl: '12px' }}>
        <Box component="span" sx={{ color: col, flex: '0 0 auto' }}>
          <DocIcon type={d.type} size={20} />
        </Box>
        <Box
          sx={{
            fontSize: 20, fontWeight: 700, letterSpacing: '-.005em', color: T.tx,
            lineHeight: 1.32, flex: 1, overflow: 'hidden',
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
              fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, padding: '2px 8px',
              borderRadius: '13px', background: T.vi2, color: T.vi, border: `1px solid ${T.vi3}`,
              flex: '0 0 auto', mt: '1px',
            }}
          >
            {d.seriesIdx}/{d.seriesTotal}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          fontSize: 16, color: T.dm2, margin: '9px 0', pl: '12px', fontFamily: FONT_MONO,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {phase ? phase.key : '-'} · {last ? usersById.get(last.by)?.name ?? '—' : '—'} ·{' '}
        {last ? fmtAt(last.at).slice(5, 16) : 'No updates'}
      </Box>

      {!compact && (
        <Box sx={{ display: 'flex', gap: '6px', pl: '12px', flexWrap: 'wrap' }}>
          <Chip c={st.c} bg={st.bg} bd={st.bd}>{st.lb}</Chip>
          {rel ? (
            <Chip c={T.tl} bg={T.tl2} bd={T.tl3}>{vstr(rel)}</Chip>
          ) : (
            <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>No release</Chip>
          )}
          {canEdit && work && <Chip c={T.am} bg={T.am2} bd={T.am3}>In progress {vstr(work)}</Chip>}
          {d.recvDept && <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>{departmentName(d.recvDept)}</Chip>}
          {recvIp && <Chip c={recvIp.color} bg={T.sf2} bd={T.ln}>→ {recvIp.name}</Chip>}
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
        fontFamily: FONT_MONO, fontSize: 14, padding: '2px 6px', borderRadius: '7px',
        border: `1px solid ${bd}`, background: bg, color: c, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}
