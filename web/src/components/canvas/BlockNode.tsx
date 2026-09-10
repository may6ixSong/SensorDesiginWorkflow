import { Box } from '@mui/material';
import { CanvasNode, stOf, tierStyle } from '@/lib/canvasModel';
import { WorkflowPhase } from '@/types/domain';
import { Icon, IconName } from '@/components/common/Icon';
import { CURSOR_POINTER, R, T, TNUM } from '@/theme/tokens';

/**
 * tier별 블록 아이콘 — A는 그 서비스가 들고 있는 "살아 있는" 산출물이라 패키지,
 * B는 동기화되는 문서, C/D는 링크·수기 기록이라 체인. 매핑이 아예 없으면 빈 상태다.
 */
function iconFor(n: CanvasNode): IconName {
  if (!n.artifactId) return 'unlinked';
  if (n.tier === 'A') return 'artifact';
  if (n.tier === 'B') return 'word';
  return 'link';
}

interface Props {
  d: CanvasNode;
  /** 이 블록이 걸린 phase. 찾을 수 없으면(=일정 유실) undefined다. */
  phase?: WorkflowPhase;
  /**
   * 일정 유실 — 가리키던 phase가 workflow 일정에서 사라졌다. 좌표는 그대로 두고
   * 표시만 확 바꿔서 "릴리즈 일정이 없다"가 한눈에 보이게 한다.
   */
  orphan?: boolean;
  edit: boolean;
  canEdit: boolean;
  isSel: boolean;
  onHl: boolean;
  dimLink: boolean;
  hasHl: boolean;
  /** 수신 부서 필터에서 제외됐다 — 숨기지 않고 흐리게만 한다(flow가 끊겨 보이면 안 된다). */
  filteredOut?: boolean;
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

/**
 * 캔버스 위의 산출물 블록.
 *
 * ★ **버전 라벨을 쓰지 않는다.** 버전은 상세 slide에서만 보이고, 여기서는 publish
 *   3상태 배지만 그린다(설계서 03장 §2.1~2.2).
 * ★ Edit/View 권한자가 **완전히 동일한 화면**을 본다 — 권한에 따라 달라지는 것은 각
 *   산출물의 내용이지 캔버스 구조가 아니다(설계서 03장 §1).
 */
export function BlockNode({
  d, phase, orphan = false, edit, canEdit, isSel, onHl, dimLink, hasHl, filteredOut = false,
  onOpen, onPinClick, onGripDown, linkActive, registerRef,
  onPointerDown, onPointerMove, onPointerUp, onClick,
}: Props) {
  const st = stOf(d);
  const tier = tierStyle(d);
  const compact = d.h < 150;

  // 클릭으로 flow 하이라이트가 켜져 있는데 이 블록이 그 흐름에 안 걸려 있으면 흐리게 —
  // 연결된 것들이 상대적으로 더 눈에 띄게 한다.
  const connected = onHl && hasHl;
  const unrelated = hasHl && !onHl;

  // 유실 표시가 가장 우선한다 — 다른 어떤 상태보다 먼저 눈에 들어와야 한다.
  const edgeColor = orphan ? T.danger : isSel || connected ? T.pr : T.ln;

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
        display: 'flex',
        flexDirection: 'column',
        // 선택된 블록 전체(Details 버튼 포함)를 자체 stacking context로 끌어올린다.
        zIndex: isSel ? 20 : 'auto',
        borderRadius: `${R.md}px`,
        background: orphan
          // 옅은 대각 줄무늬 — "여기 있으면 안 되는 것이 남아 있다"를 배경 자체로 알린다.
          ? `repeating-linear-gradient(135deg, ${T.dangerSoft} 0 8px, ${T.sf} 8px 16px)`
          : T.sf,
        border: `1px ${orphan ? 'dashed' : 'solid'} ${edgeColor}`,
        boxShadow: isSel || connected ? `0 0 0 3px ${T.ring}, ${T.shMd}` : T.shSm,
        overflow: 'hidden',
        opacity: unrelated || filteredOut ? 0.32 : 1,
        cursor: edit && canEdit ? 'grab' : CURSOR_POINTER,
        touchAction: 'none',
        transition: edit
          ? 'opacity .15s'
          : 'box-shadow .18s, transform .18s, border-color .16s, opacity .18s',
        '&:hover': edit
          ? {}
          : {
            transform: 'translateY(-2px)', boxShadow: T.shLg, borderColor: T.ln2,
            '& .blk-open': { opacity: 1 },
          },
      }}
    >
      {/* tier 색 스파인 — 블록의 신뢰도 등급을 색 하나로 계속 상기시킨다. */}
      <Box
        sx={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: orphan ? T.danger : tier.fg,
          opacity: d.artifactId ? 1 : 0.35,
        }}
      />

      {/* 상세 열기.
          단순 클릭은 flow 하이라이트라서, 상세는 따로 눌러야 열린다.
          ★ 예전에는 블록 **위쪽 바깥**에 떠 있는 버튼이었는데, 블록이 캔버스 위쪽에
            있으면 phase 헤더 띠에 그대로 가려져 누를 수가 없었다(실측). 그래서 블록
            **안쪽** 모서리로 들여놨다 — 카드 경계를 넘지 않으니 무엇에도 가리지 않는다. */}
      {!edit && (
        <Box
          className="blk-open"
          component="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}
          title="Open details"
          aria-label={`Open ${d.name}`}
          sx={{
            position: 'absolute', right: 6, bottom: 6, zIndex: 5,
            width: 20, height: 20, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', fontFamily: 'inherit',
            background: isSel ? T.pr : T.sf3, color: isSel ? T.prTx : T.dm,
            border: `1px solid ${isSel ? 'transparent' : T.ln2}`,
            cursor: CURSOR_POINTER,
            // 선택된 블록에서는 늘 보이고, 그 외에는 hover에서만 나타난다 —
            // 카드 여덟 개가 동시에 버튼을 들고 있으면 캔버스가 시끄러워진다.
            opacity: isSel ? 1 : 0,
            transition: 'opacity .14s ease, background .14s ease',
            '&:hover': { background: T.pr, color: T.prTx, borderColor: 'transparent' },
          }}
        >
          <Icon name="eye" />
        </Box>
      )}

      <Box sx={{ padding: compact ? '9px 11px 8px 13px' : '11px 13px 10px 15px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 윗줄 — tier 배지 + 상태 점 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '7px' }}>
          <Box
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: orphan ? T.dangerSoft : tier.bg, color: orphan ? T.danger : tier.fg,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              padding: '2px 6px', borderRadius: `${R.xs}px`, flexShrink: 0,
            }}
          >
            <Icon name={iconFor(d)} />
            {d.tier ?? '—'}
          </Box>

          {d.net === 'HPC' && (
            <Box
              sx={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', color: T.dm,
                background: T.sf3, padding: '2px 5px', borderRadius: `${R.xs}px`, flexShrink: 0,
              }}
            >
              HPC
            </Box>
          )}

          <Box sx={{ flex: 1 }} />

          {/* 같은 산출물이 여러 phase에 걸쳐 놓인 경우의 회차(2/3 …).
              아래쪽에 두면 Details 버튼과 자리가 겹쳐서 윗줄로 올렸다. */}
          {d.seriesTotal > 1 && (
            <Box sx={{ fontSize: 10, color: T.dm2, fontWeight: 600, flexShrink: 0, ...TNUM }}>
              {d.seriesIdx}/{d.seriesTotal}
            </Box>
          )}

          {/* 열람 권한이 없으면 자물쇠만 — 상태 자체가 정보라 배지를 그리지 않는다. */}
          {d.artifactMasked ? (
            <Box sx={{ color: T.dm2, display: 'inline-flex' }} title="No access">
              <Icon name="lock" />
            </Box>
          ) : (
            <Box
              title={st.lb}
              sx={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: st.c,
                // "신규 발행"은 다음 release에서 highlight될 대상이라 계속 눈에 띄어야 한다.
                boxShadow: d.publishState === 'newlyPublished' ? `0 0 0 3px ${T.prSoft}` : 'none',
              }}
            />
          )}
        </Box>

        {/* 이름 */}
        <Box
          sx={{
            fontSize: compact ? 12.5 : 13.5, fontWeight: 600, lineHeight: 1.35, color: T.tx,
            display: '-webkit-box', WebkitLineClamp: compact ? 2 : 3, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', wordBreak: 'break-word',
          }}
        >
          {d.name}
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* 아랫줄 — 수신 부서(누구에게 가는가)와 회차 */}
        {/* 오른쪽 아래 모서리는 Details 버튼 자리라 그만큼 비워 둔다(편집 모드는 그립 자리). */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', mt: '8px', minWidth: 0, pr: '24px' }}>
          {orphan ? (
            <Box sx={{ fontSize: 10.5, fontWeight: 600, color: T.danger, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Icon name="warn" /> No schedule
            </Box>
          ) : d.recipientDepartments.length ? (
            <>
              {d.recipientDepartments.slice(0, 2).map((dep) => (
                <Box
                  key={dep}
                  sx={{
                    fontSize: 10, color: T.dm, background: T.sf3, borderRadius: `${R.xs}px`,
                    padding: '2px 6px', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis', maxWidth: 84,
                  }}
                >
                  {dep}
                </Box>
              ))}
              {d.recipientDepartments.length > 2 && (
                <Box sx={{ fontSize: 10, color: T.dm2 }}>+{d.recipientDepartments.length - 2}</Box>
              )}
            </>
          ) : (
            <Box sx={{ fontSize: 10.5, color: T.dm2 }}>
              {d.artifactId ? 'No recipient' : 'No source'}
            </Box>
          )}

          <Box sx={{ flex: 1 }} />
        </Box>
      </Box>

      {/* 편집 모드 — 드래그 그립과 flow 연결 핀 */}
      {edit && canEdit && (
        <>
          <Box
            onPointerDown={(e) => { e.stopPropagation(); onGripDown(d.id, e); }}
            title="Resize"
            sx={{
              position: 'absolute', right: 3, bottom: 3, width: 14, height: 14,
              cursor: 'nwse-resize', color: T.dm2, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', opacity: 0.7,
              '&:hover': { opacity: 1, color: T.pr },
            }}
          >
            <Icon name="expand" />
          </Box>
          <Box
            component="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPinClick(d.id, e); }}
            title="Connect flow"
            sx={{
              position: 'absolute', right: 6, top: 6, width: 18, height: 18, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', border: `1px solid ${linkActive ? T.pr : T.ln2}`,
              background: linkActive ? T.pr : T.sf, color: linkActive ? T.prTx : T.dm,
              cursor: CURSOR_POINTER, fontFamily: 'inherit',
              '&:hover': { borderColor: T.pr, color: linkActive ? T.prTx : T.pr },
            }}
          >
            <Icon name="send" />
          </Box>
        </>
      )}
    </Box>
  );
}
