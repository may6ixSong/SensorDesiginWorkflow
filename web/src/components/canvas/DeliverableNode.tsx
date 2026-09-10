import { Box } from '@mui/material';
import { CanvasNode, latA, latR, hasW, stOf, vstr, versionBy, fmtAt } from '@/lib/canvasModel';
import { Tier, WorkflowBriefDto, WorkflowPhase } from '@/types/domain';
import { departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Icon, IconName } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/**
 * tier별 블록 아이콘(사용자 요청) — B는 기존처럼 문서, A는 "그 서비스가 들고 있는
 * 진짜 산출물"이라는 느낌의 패키지 아이콘, C/D는 경로/링크 느낌의 체인 아이콘.
 *
 * C/D 티어는 Hub 서비스 연동(serviceKey) 없이 수동으로 기록된 경우가 정상이다
 * (Hub 설계서 §9 - 수동 버전 기록). 그래서 "출처가 없다"만으로 unlinked 아이콘을
 * 쓰면 실제로 Tier C로 기록된 산출물까지 빈 박스로 보인다(실측 확인된 문제) - 정말
 * 아무것도 기록된 게 없을 때(버전이 하나도 없고 서비스도 안 걸린 경우)만 unlinked를
 * 쓴다.
 */
function iconForNode(d: CanvasNode, tier: Tier): IconName {
  if (!d.serviceKey && d.versions.length === 0) return 'unlinked';
  if (tier === 'A') return 'artifact';
  if (tier === 'B') return 'word';
  return 'link';
}

interface Props {
  d: CanvasNode;
  /** 아이콘/LIVE 배지를 결정하는 유효 tier(Hub 설계서 §5.1, canvasModel.effectiveTier). */
  tier: Tier;
  /** 이 산출물이 걸린 phase. 찾을 수 없으면(=일정 유실) undefined다. */
  phase?: WorkflowPhase;
  /**
   * 일정 유실 — 이 산출물이 가리키던 phase가 workflow 일정에서 사라졌다는 뜻이다.
   * 좌표는 그대로 두고(요청) 표시만 확 바꿔서, "릴리즈 일정이 없다"가 한눈에 보이게 한다.
   */
  orphan?: boolean;
  /** recvWorkflowId가 가리키는 대상 workflow(id/name/color) — "→ 다른 workflow에 준다" 배지용. */
  recvWorkflow?: WorkflowBriefDto;
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
  d, tier, phase, orphan = false, recvWorkflow, edit, canEdit, isSel, onHl, dimLink, hasHl,
  onOpen, onPinClick, onGripDown, linkActive, registerRef,
  onPointerDown, onPointerMove, onPointerUp, onClick,
}: Props) {
  const { resolveUser } = useDirectory();
  const st = stOf(d);
  const rel = latR(d);
  const work = hasW(d) ? latA(d) : null;
  const last = latA(d);
  const compact = d.h < 175;
  const col = d.serviceKey ? T.pr : T.info;
  // 진짜 다른 workflow 소유 — 이 캔버스에서 위치 편집 불가, edit 모드에서 흐리게 처리.
  const incoming = d.origin === 'incoming';
  // 이 시스템에 없는 외부 부서로부터 받은 것으로 표시된 own 산출물 — own이므로
  // 위치·Phase 편집은 완전히 자유롭다. 시각적으로만 "받은 것" 느낌을 준다.
  const externalIncoming = !incoming && !!d.sourceDept;
  // 이 workflow가 받기를 기다리는 자리표시자(intent==='received') — 이것도 "내가 만든
  // 게 아니라 밖에서 온다"는 점에서 위 둘과 같은 부류라 같은 배경색을 쓴다(사용자 요청:
  // 별도 안내 문구 대신 캔버스 배경색만으로 구분).
  const showIncomingStyle = incoming || externalIncoming || d.intent === 'received';
  // 받는 산출물은 "다른 IP가 준 것"이라는 정도만 드러내고 어느 workflow/부서인지는 캔버스
  // 블록에 표시하지 않는다 — 그래서 출처 색상 대신 고정된 violet을 쓴다.
  const srcColor = T.pr;
  // 유실 표시는 다른 어떤 스타일보다 우선한다 — 받은 산출물이든 아니든, 일정이 없어진
  // 사실이 가장 먼저 눈에 들어와야 한다.
  const edgeColor = orphan ? T.danger : isSel ? T.pr : dimLink ? T.pr : showIncomingStyle ? srcColor : T.ln2;
  // 클릭으로 flow 하이라이트가 켜져 있는데(hasHl) 이 블록은 그 흐름에 안 걸려 있으면(!onHl)
  // 살짝 흐리게 — 연결된 것들이 상대적으로 더 눈에 띄게 한다.
  const connected = onHl && hasHl;
  const unrelated = hasHl && !onHl;

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
        // 선택된 블록 전체(Details 버튼 포함)를 자체 stacking context로 끌어올린다 — 그래야
        // 옆 블록의 hover(transform)나 incoming opacity가 만드는 stacking context에
        // Details 버튼이 가려지지 않는다(내부 zIndex:40은 부모가 stacking context를
        // 만들 때만 의미가 있다). 드래그 중 zIndex(30)보다는 낮게 둔다.
        zIndex: isSel ? 20 : 'auto',
        borderRadius: '15px',
        background: orphan
          // 옅은 대각 줄무늬 — "여기 있으면 안 되는 것이 남아 있다"는 느낌을 배경 자체로 준다.
          ? `repeating-linear-gradient(135deg, ${T.dangerSoft} 0 9px, ${T.sf} 9px 18px)`
          : showIncomingStyle ? T.prSoft : T.sf,
        border: `2px ${orphan || showIncomingStyle ? 'dashed' : 'solid'} ${edgeColor}`,
        boxShadow: orphan
          ? `0 0 0 3px ${T.dangerSoft}, ${T.shSm}`
          : isSel ? `0 0 0 4px ${T.prSoft}, ${T.shSm}`
          : connected ? `0 0 0 4px ${T.prLine}, ${T.shLg}` : T.shSm,
        overflow: 'visible',
        // 유실 리본이 좌상단을 통째로 차지하므로 그만큼 위를 비워 준다 — 안 그러면
        // 리본이 산출물 이름 위에 그대로 올라탄다(실측 확인).
        padding: orphan ? '30px 13px 10px' : '12px 13px 10px',
        outline: connected ? `5px solid ${T.pr}` : 'none',
        outlineOffset: connected ? '4px' : 0,
        // 다른 workflow 소유(incoming)는 같은 Phase 안에서만 옮길 수 있는 제한된 영역임을
        // edit 모드에서 낮은 opacity로 드러낸다 — pin(연결)·같은 Phase 내 드래그 모두
        // opacity와 무관하게 계속 동작한다. unrelated는 그 아래(view 모드 flow 하이라이트) 우선순위.
        opacity: edit && incoming ? 0.45 : unrelated ? 0.4 : 1,
        cursor: edit && canEdit ? 'grab' : CURSOR_POINTER,
        touchAction: 'none',
        transition: edit ? 'opacity .15s' : 'box-shadow .15s, transform .15s, border-color .14s, opacity .15s',
        '&:hover': edit ? {} : { transform: 'translateY(-3px)', boxShadow: T.shLg, borderColor: showIncomingStyle ? srcColor : T.ln3 },
        '&::before': {
          content: '""', position: 'absolute', top: 10, left: 10, width: 6, height: 6,
          borderRadius: '50%', background: orphan ? T.danger : showIncomingStyle ? srcColor : T.ln3,
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
            padding: '7px 16px', borderRadius: '10px', boxShadow: T.shLg, zIndex: 40,
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

      {/* 일정 유실 리본 — 좌상단을 통째로 차지해서 다른 배지보다 먼저 읽힌다. */}
      {orphan && (
        <Box
          component="span"
          title="This artifact's phase was removed from the workflow schedule. It kept its position on the canvas, but it has no release schedule until you assign one."
          sx={{
            position: 'absolute', top: 0, left: 0, padding: '4px 10px',
            borderBottomRightRadius: '12px', background: T.danger, color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
            zIndex: 3,
          }}
        >
          <Icon name="warn" size={12} /> NO SCHEDULE
        </Box>
      )}

      {/* 어느 workflow/부서가 준 건지는 블록에 안 드러낸다(요청) — 상세(dialog)에서만 확인 가능.
          여기서는 "받은 산출물"이라는 것만 잠금 아이콘으로 드러낸다. incoming(다른 workflow
          소유)과 externalIncoming(외부 부서, 하지만 own) 둘 다 대상. */}
      {showIncomingStyle && !orphan && (
        <Box
          component="span"
          title="Received — open for details"
          sx={{
            position: 'absolute', top: 0, left: 0, padding: '4px 9px',
            borderBottomRightRadius: '12px', background: srcColor, color: '#fff',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Icon name="lock" size={13} />
        </Box>
      )}
      {/* A 티어(연동된 서비스에서 지금 라이브로 관측됨)만 표시한다 — 서비스명 자체는
          더 이상 블록에 노출하지 않는다(사용자 요청, 상세 패널에서 확인). */}
      {tier === 'A' && (
        <Box
          component="span"
          title="Live — observed from the connected service"
          sx={{
            position: 'absolute', bottom: 0, left: 0, padding: '4px 9px 5px',
            borderTopRightRadius: '12px', background: T.prSoft, color: T.pr,
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          }}
        >
          <Box
            component="span"
            sx={{ width: 6, height: 6, borderRadius: '50%', background: T.pr, flex: '0 0 auto' }}
          />
          LIVE
        </Box>
      )}

      {/* pin (좌: 입력, 우: 연결 시작) */}
      <Box
        sx={{
          position: 'absolute', top: '50%', left: -9, width: 18, height: 18, mt: '-9px',
          borderRadius: '50%', background: dimLink ? T.pr : T.sf,
          border: `3px solid ${dimLink ? T.pr : T.ln3}`, transition: '.12s', zIndex: 4,
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
              background: linkActive ? T.pr : T.sf,
              border: `3px solid ${linkActive ? T.pr : T.ln3}`,
              transform: linkActive ? 'scale(1.3)' : 'none',
              '&:hover': { background: T.pr, borderColor: T.pr, transform: 'scale(1.3)' },
            }}
          />
          {/* origin==='incoming'은 다른 workflow 소유라 이 캔버스에서 리사이즈할 수 없다 — pin(연결)만 허용. */}
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
                '&:hover::after': { borderColor: T.pr },
              }}
            />
          )}
        </>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', pl: '12px' }}>
        <Box component="span" sx={{ color: col, flex: '0 0 auto' }}>
          <Icon name={iconForNode(d, tier)} size={20} />
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
      </Box>

      <Box
        sx={{
          fontSize: 16, color: orphan ? T.danger : T.dm2, margin: '9px 0', pl: '12px', fontFamily: FONT_MONO,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {orphan ? 'Release schedule lost' : phase ? phase.name : '-'} ·{' '}
        {last ? resolveUser(versionBy(last)).name : '—'} ·{' '}
        {last ? fmtAt(last.at).slice(5, 16) : 'No updates'}
      </Box>

      {!compact && (
        <Box sx={{ display: 'flex', gap: '6px', pl: '12px', flexWrap: 'wrap' }}>
          {orphan && <Chip c={T.danger} bg={T.dangerSoft} bd={T.danger}>Not on the schedule</Chip>}
          <Chip c={st.c} bg={st.bg} bd={st.bd}>{st.lb}</Chip>
          {rel ? (
            <Chip c={T.pr} bg={T.prSoft} bd={T.prLine}>{vstr(rel)}</Chip>
          ) : (
            <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>No release</Chip>
          )}
          {canEdit && work && <Chip c={T.warn} bg={T.warnSoft} bd={T.warnLine}>In progress {vstr(work)}</Chip>}
          {d.recvDept && <Chip c={T.dm2} bg={T.sf2} bd={T.ln}>{departmentName(d.recvDept)}</Chip>}
          {recvWorkflow && <Chip c={recvWorkflow.color} bg={T.sf2} bd={T.ln}>→ {recvWorkflow.name}</Chip>}
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
