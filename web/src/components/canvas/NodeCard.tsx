import { Box } from '@mui/material';
import { CanvasNode, stOf } from '@/lib/canvasModel';
import { WorkflowPhase } from '@/types/domain';
import { Icon, IconName } from '@/components/common/Icon';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { CURSOR_POINTER, R, T, TNUM } from '@/theme/tokens';

/**
 * tier별 노드 아이콘 — A는 그 서비스가 들고 있는 "살아 있는" 산출물이라 패키지,
 * B는 동기화되는 문서, C는 링크·수기 기록이라 체인. 매핑이 아예 없으면 빈 상태다.
 */
function iconFor(n: CanvasNode): IconName {
  if (!n.artifactId) return 'unlinked';
  if (n.tier === 'A') return 'artifact';
  if (n.tier === 'B') return 'word';
  return 'link';
}

interface Props {
  d: CanvasNode;
  /** 이 노드가 걸린 phase. 찾을 수 없으면(=일정 유실) undefined다. */
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
 * 캔버스 위의 산출물 노드.
 *
 * ★ **버전 라벨을 쓰지 않는다.** 버전은 상세 slide에서만 보이고, 여기서는 publish
 *   3상태 배지만 그린다(설계서 03장 §2.1~2.2).
 * ★ Edit/View 권한자가 **완전히 동일한 화면**을 본다 — 권한에 따라 달라지는 것은 각
 *   산출물의 내용이지 캔버스 구조가 아니다(설계서 03장 §1).
 */
export function NodeCard({
  d, phase, orphan = false, edit, canEdit, isSel, onHl, dimLink, hasHl, filteredOut = false,
  onOpen, onPinClick, onGripDown, linkActive, registerRef,
  onPointerDown, onPointerMove, onPointerUp, onClick,
}: Props) {
  const st = stOf(d);
  const compact = d.h < 150;

  // 클릭으로 flow 하이라이트가 켜져 있는데 이 노드가 그 흐름에 안 걸려 있으면 흐리게 —
  // 연결된 것들이 상대적으로 더 눈에 띄게 한다.
  const connected = onHl && hasHl;
  const unrelated = hasHl && !onHl;

  // 유실 표시가 가장 우선한다 — 다른 어떤 상태보다 먼저 눈에 들어와야 한다.
  const emph = isSel || connected;
  // "내가 주는 게 아니라 밖에서 받는 것" — "새 Artifact 추가" 다이얼로그의 intent
  // 선택(주는/받는, 설계서 04장 §6.1)을 그대로 캔버스에서 구별해 보여준다.
  const received = d.intent === 'received';
  // 선택/flow 하이라이트는 강조색(T.pr)과 다른 색을 써야 한다 — 안 그러면 "지금 고른 것"과
  // "항상 인디고인 UI"가 눈으로 구별되지 않는다(사용자 피드백).
  const edgeColor = orphan ? T.danger : emph ? T.select : received ? T.recv : T.ln2;

  return (
    <Box
      ref={(el: HTMLDivElement | null) => registerRef(d.id, el)}
      data-bid={d.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      // 더블클릭으로도 상세를 연다 — 편집 중에는 더블클릭이 레이아웃 조작과 겹치니 막는다.
      onDoubleClick={(e) => { e.stopPropagation(); if (!edit) onOpen(d.id); }}
      // 위치/크기는 style prop으로 — 드래그마다 emotion 클래스가 새로 생기는 것을 막고,
      // React가 DOM을 직접 갱신하므로 취소 시 이전 위치로 확실히 되돌아간다.
      style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
      sx={{
        position: 'absolute',
        // 선택된 노드 전체(Details 버튼 포함)를 자체 stacking context로 끌어올린다.
        zIndex: isSel ? 20 : 'auto',
        // 카드 자체는 overflow: hidden(아래)이라 안쪽 모서리를 둥글게 잘라내지만, Details
        // 버튼은 카드 바깥 위쪽에 떠야 하므로 이 바깥 래퍼는 잘라내지 않는다.
        cursor: edit && canEdit ? 'grab' : CURSOR_POINTER,
        touchAction: 'none',
        '&:hover': edit
          ? {}
          : { '& .blk-card': { transform: 'translateY(-2px)', boxShadow: T.shLg, borderColor: T.ln2 } },
      }}
    >
      {/* 상세 열기 — 이 세션 이전부터 있던 원래 모양(짙은 배경 + 흰 "Details" 글자,
          말풍선 꼭지 포함)으로 복원했다(사용자 요청). 선택됐을 때만 뜨고, 더블클릭으로도
          동일하게 열린다. T.inv는 테마와 무관하게 항상 어두운 표면이라 dark 모드에서도
          카드 배경과 구별된다. zIndex를 노드 자체보다 높게 둬서 phase 헤더 띠에 가려지지
          않는다. */}
      {!edit && isSel && (
        <Box
          className="blk-open"
          component="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}
          title="Open details"
          aria-label={`Open ${d.name}`}
          sx={{
            // 버튼 전체를 20% 키웠다(사용자 요청) — 커진 높이만큼 node 위 여백도 다시 맞춘다.
            position: 'absolute', top: 0, left: '50%',
            transform: 'translate(-50%, -46px)', zIndex: 15,
            display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
            background: T.inv, color: T.invTx, fontSize: 17, fontWeight: 600, fontFamily: 'inherit',
            padding: '8px 17px', borderRadius: '12px', boxShadow: T.shLg, border: 'none',
            cursor: CURSOR_POINTER,
            '&:hover': { background: T.inv },
            '&::after': {
              content: '""', position: 'absolute', left: '50%', bottom: -6, width: 12, height: 12,
              background: T.inv, transform: 'translateX(-50%) rotate(45deg)',
            },
          }}
        >
          <Icon name="eye" size={17} /> Details
        </Box>
      )}

      {/* 카드 — border/background/overflow는 여기서만. 바깥 래퍼와 분리해야 Details
          버튼(카드 바깥 위쪽)이 overflow: hidden에 잘려나가지 않는다. */}
      <Box
        className="blk-card"
        sx={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          borderRadius: `${R.md}px`,
          background: orphan
            // 옅은 대각 줄무늬 — "여기 있으면 안 되는 것이 남아 있다"를 배경 자체로 알린다.
            ? `repeating-linear-gradient(135deg, ${T.dangerSoft} 0 8px, ${T.sf} 8px 16px)`
            : received ? T.recvSoft : T.sf,
          border: `${emph ? 2 : 1.5}px ${orphan || received ? 'dashed' : 'solid'} ${edgeColor}`,
          boxShadow: emph ? `0 0 0 4px ${T.selectRing}, ${T.shMd}` : T.shSm,
          overflow: 'hidden',
          opacity: unrelated || filteredOut ? 0.32 : 1,
          transition: edit
            ? 'opacity .15s'
            : 'box-shadow .18s, transform .18s, border-color .16s, opacity .18s',
        }}
      >
        {/* publish 상태 스파인 — 우하단 범례(Legend)와 같은 3색(미발행/신규발행/발행됨)을
            그대로 써서, 범례를 보지 않아도 왼쪽 테두리만으로 상태를 읽을 수 있게 한다. */}
        <Box
          sx={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            background: orphan ? T.danger : st.c,
            opacity: d.artifactId ? 1 : 0.35,
          }}
        />

        <Box sx={{ padding: compact ? '9px 11px 8px 13px' : '11px 13px 10px 15px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* 윗줄 — 네트워크 표식 + 상태 점. Tier는 사용자에게 공개하는 정보가 아니라서
              (사용자 요청) 여기엔 글자/배지로 안 두고, 아이콘 모양으로만 이름 옆에 놓는다
              (아래 "이름" 참고). */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '7px' }}>
            {/* 네트워크 표식 — 그 artifact에 등록된 실제 network 값을 그대로 읽는다(설계서
                04장 §2.2) — tier에서 미리 정해두지 않는다. File Artifacts(B)는 File
                콘텐츠면 network가 없어 표식을 그리지 않는다. */}
            {/* 20% 키웠다(사용자 요청: 9.5 -> 11.5) — NetworkTag가 Release list/dialog와
                공유하는 바로 이 모양·색이다. */}
            <NetworkTag network={d.net} />

            <Box sx={{ flex: 1 }} />

            {/* 같은 산출물이 여러 phase에 걸쳐 놓인 경우의 회차(2/3 …). 확대 안 해도
                보이게 2배로 키웠다(사용자 요청: 10 -> 20). */}
            {d.seriesTotal > 1 && (
              <Box sx={{ fontSize: 20, color: T.dm2, fontWeight: 600, flexShrink: 0, ...TNUM }}>
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
                  // 확대 안 해도 보이게 2배로 키웠다(사용자 요청: 7px -> 14px).
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  background: st.c,
                  // "신규 발행"은 다음 release에서 highlight될 대상이라 계속 눈에 띄어야 한다.
                  boxShadow: d.publishState === 'newlyPublished' ? `0 0 0 6px ${T.prSoft}` : 'none',
                }}
              />
            )}
          </Box>

          {/* 이름 — tier 아이콘을 배지/글자 없이 이름 옆에만 둔다(사용자 요청: tier는
              사용자에게 공개하는 정보가 아니다). 아이콘 모양 자체는 tier마다 다르지만
              (A=artifact, B=word, C/D=link), 글자·색으로 tier를 드러내지 않도록 중립색만 쓴다. */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
            <Box component="span" sx={{ color: T.dm, flexShrink: 0, mt: '3px' }}>
              <Icon name={iconFor(d)} size={compact ? 16 : 18} />
            </Box>
            <Box
              sx={{
                fontSize: compact ? 21 : 24, fontWeight: 600, lineHeight: 1.25, color: T.tx,
                display: '-webkit-box', WebkitLineClamp: compact ? 2 : 3, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', wordBreak: 'break-word', minWidth: 0, flex: 1,
              }}
            >
              {d.name}
            </Box>
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* 아랫줄 — 수신 부서(누구에게 가는가)와 회차 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', mt: '8px', minWidth: 0 }}>
            {orphan ? (
              <Box sx={{ fontSize: 10.5, fontWeight: 600, color: T.danger, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="warn" /> No schedule
              </Box>
            ) : d.recipientDepartments.length ? (
              // 2배로 키웠던 걸 사용자 요청으로 그 2/3로 다시 줄였다(20 -> 13.5, 패딩·폭도
              // 같은 비율).
              <>
                {d.recipientDepartments.slice(0, 2).map((dep) => (
                  <Box
                    key={dep}
                    sx={{
                      fontSize: 13.5, color: T.dm, background: T.sf3, borderRadius: `${R.xs}px`,
                      padding: '2.5px 8px', whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis', maxWidth: 112,
                    }}
                  >
                    {/* 저장된 값이 (옛 데이터 등으로) 소문자 id일 수 있다 — 6개 고정
                        부서면 항상 정식 이름으로, 그 외 자유 입력 부서명은 원래 그대로
                        보여준다(사용자 지적: 일부러 소문자로 바꾸면 안 된다). */}
                    {canonicalDepartmentLabel(dep)}
                  </Box>
                ))}
                {d.recipientDepartments.length > 2 && (
                  <Box sx={{ fontSize: 13.5, color: T.dm2 }}>+{d.recipientDepartments.length - 2}</Box>
                )}
              </>
            ) : !d.artifactId ? (
              // "No recipient"는 굳이 안 써도 된다(사용자 지적) — artifact는 있는데
              // 아직 아무도 안 받는 것뿐이라 빈 줄로 둔다. "No source"는 자리 자체가
              // 아직 아무 산출물에도 안 걸려 있다는 뜻이라 계속 알려준다.
              <Box sx={{ fontSize: 10.5, color: T.dm2 }}>No source</Box>
            ) : null}

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
    </Box>
  );
}
