import { useMemo, useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BlockDto, WorkflowPhase } from '@/types/domain';
import { useReplaceBlockRecipients } from '@/api/hooks/useBlocks';
import { sortSchedule } from '@/lib/schedule';
import { ModalShell } from '@/components/common/ModalShell';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { Icon } from '@/components/common/Icon';
import { Ey } from '@/components/common/Panel';
import { toast } from '@/store/toastStore';
import { MOTION } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { R, T } from '@/theme/tokens';

const PHASE_W = 92;
const ROW_HEADER_W = 190;
const COL_W = 120;
const HEADER_ROW_H = 40;
const DATA_ROW_H = 44;
/** phase 그룹 경계선 — 기본 grid 선(T.ln)보다 한 단계 더 진하게(사용자 요청). */
const PHASE_BORDER = `2px solid ${T.ln2}`;

interface Props {
  workflowId: string;
  blocks: BlockDto[];
  phases: WorkflowPhase[];
  /** 그 과제에 등록된 부서(Project.departments) — 열이 된다. */
  departmentOptions: string[];
  onClose: () => void;
}

interface PendingToggle {
  block: BlockDto;
  dept: string;
  adding: boolean;
}

/** 연속된 같은 phase 행을 하나의 rowSpan 셀로 묶기 위한 그룹 정보. */
interface PhaseGroup {
  name: string;
  span: number;
}

/**
 * "Artifact별 전달 부서" 매트릭스 — workflow toolbar(canvas/list view가 공유하는 헤더)의
 * table 아이콘 버튼에서 연다(사용자 요청).
 *
 * ★ 행 = 이 workflow가 **주는**(intent === 'own') artifact뿐이다 — 받는(received) 쪽은
 *   recipient 개념 자체가 없다. 열 = 그 과제의 부서(사용자 요청: 부서가 열).
 * ★ artifact 이름 왼쪽에 phase 열을 따로 두고, 같은 phase가 연속되면 rowSpan으로
 *   병합한다(사용자 요청 — 예전에 artifact가 열이었을 때 phase group header를
 *   colSpan으로 묶던 것과 대칭이다). 그 phase 그룹의 경계는 기본 grid 선보다 한 단계
 *   더 진한 border(PHASE_BORDER)로 표시한다(사용자 요청).
 * ★ 셀 하나하나가 그 block의 recipient(AccessGrant.departments) 토글 스위치다. 클릭은
 *   바로 반영되지 않고 항상 confirm을 거친다 — 실수로 전달 대상을 바꾸면 알림이 엉뚱한
 *   부서로 나가기 때문이다.
 * ★ replaceRecipients는 **완전 교체**라(부분 병합 아님, blocks.service.ts
 *   replaceRecipients) departments만 바꿀 때도 기존 users는 그대로 실어 보내야 한다.
 * ★ hover 효과는 그 셀 하나로 국한한다(사용자 요청) — 행/열 전체로 번지는 밴드 강조는
 *   쓰지 않는다. 그래서 hover 상태는 JS로 추적하지 않고 각 셀의 `&:hover` CSS만으로
 *   처리한다.
 */
export function RecipientMatrixDialog({ workflowId, blocks, phases, departmentOptions, onClose }: Props) {
  const { t } = useTranslation();
  const m = useMotion();
  const replaceRecipients = useReplaceBlockRecipients(workflowId);

  const [pending, setPending] = useState<PendingToggle | null>(null);

  const orderedPhases = useMemo(() => sortSchedule(phases), [phases]);
  const phaseNameOf = (phaseId: string) => phases.find((p) => p.id === phaseId)?.name ?? '—';

  /** 내가 주는 artifact만 — phase 순서 → 이름 순으로 정렬해 행을 만든다. */
  const rows = useMemo(() => {
    const phaseIdx = new Map(orderedPhases.map((p, i) => [p.id, i]));
    return blocks
      .filter((b) => b.intent === 'own')
      .sort((a, b) => {
        const pa = phaseIdx.get(a.phaseId) ?? orderedPhases.length;
        const pb = phaseIdx.get(b.phaseId) ?? orderedPhases.length;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
  }, [blocks, orderedPhases]);

  /**
   * 행 인덱스별 phase 병합 정보 — 그 그룹의 첫 행이면 {name, span}, 아니면 null(그
   * 자리엔 셀을 아예 그리지 않는다 — 위 행의 rowSpan이 덮는다, 진짜 HTML rowSpan이라야
   * sticky 위치도 자연스럽게 맞는다).
   */
  const phaseCells = useMemo(() => {
    const out: (PhaseGroup | null)[] = [];
    rows.forEach((b, i) => {
      if (i > 0 && rows[i - 1].phaseId === b.phaseId) {
        out.push(null);
        return;
      }
      let span = 1;
      while (rows[i + span] && rows[i + span].phaseId === b.phaseId) span += 1;
      out.push({ name: phaseNameOf(b.phaseId), span });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, phases]);

  /** 그 행이 자기 phase 그룹의 마지막 행인가 — 그 아래 border를 진하게 그린다. */
  const isPhaseBoundary = (rowIdx: number) =>
    rowIdx === rows.length - 1 || rows[rowIdx + 1].phaseId !== rows[rowIdx].phaseId;

  const handleCellClick = (block: BlockDto, dept: string) => {
    if (!block.artifactId || replaceRecipients.isPending) return;
    const has = block.recipients?.departments.includes(dept) ?? false;
    setPending({ block, dept, adding: !has });
  };

  const confirmToggle = () => {
    if (!pending) return;
    const { block, dept, adding } = pending;
    const currentDepts = block.recipients?.departments ?? [];
    const nextDepts = adding ? [...currentDepts, dept] : currentDepts.filter((d) => d !== dept);
    replaceRecipients.mutate(
      { blockId: block.id, departments: nextDepts, users: block.recipients?.users ?? [] },
      {
        onSuccess: () => {
          toast(adding ? t('recipientMatrix.addedToast') : t('recipientMatrix.removedToast'));
          setPending(null);
        },
        onError: (e: any) => {
          toast(e?.response?.data?.message ?? t('recipientMatrix.updateFailed'));
          setPending(null);
        },
      },
    );
  };

  return (
    <>
      <ModalShell
        open
        onClose={onClose}
        disableBackdropClose
        width="80vw"
        height="80vh"
        header={
          <>
            <Ey>{t('recipientMatrix.eyebrow')}</Ey>
            <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>{t('recipientMatrix.title')}</Box>
            <Box sx={{ fontSize: 12, color: T.dm2, mt: '3px' }}>{t('recipientMatrix.subtitle')}</Box>
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState text={t('recipientMatrix.emptyBlocks')} />
        ) : departmentOptions.length === 0 ? (
          <EmptyState text={t('recipientMatrix.emptyDepartments')} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={m(MOTION.fade)}
            style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                border: `1px solid ${T.ln}`,
                borderRadius: `${R.md}px`,
                background: T.sf,
              }}
            >
              <Box
                component="table"
                sx={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}
              >
                <Box component="thead">
                  <Box component="tr">
                    <Box
                      component="th"
                      sx={{
                        position: 'sticky', top: 0, left: 0, zIndex: 5,
                        width: PHASE_W, minWidth: PHASE_W, height: HEADER_ROW_H,
                        background: T.sf3, borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
                        fontSize: 10, fontWeight: 700, color: T.dm2, letterSpacing: '0.03em',
                        padding: '8px 10px', textAlign: 'left', verticalAlign: 'middle',
                      }}
                    >
                      {t('recipientMatrix.phaseColumn')}
                    </Box>
                    <Box
                      component="th"
                      sx={{
                        position: 'sticky', top: 0, left: PHASE_W, zIndex: 5,
                        width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: HEADER_ROW_H,
                        background: T.sf3, borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
                        fontSize: 11, fontWeight: 700, color: T.dm2, letterSpacing: '0.03em',
                        padding: '8px 12px', textAlign: 'left', verticalAlign: 'middle',
                      }}
                    >
                      {t('recipientMatrix.artifactColumn')}
                    </Box>
                    {departmentOptions.map((dept) => (
                      <Box
                        component="th"
                        key={dept}
                        sx={{
                          position: 'sticky', top: 0, zIndex: 2,
                          width: COL_W, minWidth: COL_W, height: HEADER_ROW_H,
                          background: T.sf2, borderBottom: `1px solid ${T.ln}`, borderRight: `1px solid ${T.ln}`,
                          fontSize: 11.5, fontWeight: 700, color: T.tx2,
                          padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle',
                        }}
                      >
                        <Tooltip title={dept}>
                          <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dept}
                          </Box>
                        </Tooltip>
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box component="tbody">
                  {rows.map((b, rowIdx) => {
                    const rowBg = rowIdx % 2 === 0 ? T.sf : T.sf2;
                    const mapped = Boolean(b.artifactId);
                    const phase = phaseCells[rowIdx];
                    const boundary = isPhaseBoundary(rowIdx);
                    const bottomBorder = boundary ? PHASE_BORDER : `1px solid ${T.ln}`;
                    return (
                      <Box component="tr" key={b.id}>
                        {phase && (
                          <Box
                            component="th"
                            rowSpan={phase.span}
                            sx={{
                              position: 'sticky', left: 0, zIndex: 1,
                              width: PHASE_W, minWidth: PHASE_W,
                              background: T.sf3,
                              borderRight: `1px solid ${T.ln}`, borderBottom: PHASE_BORDER,
                              fontSize: 10.5, fontWeight: 700, color: T.dm2, letterSpacing: '0.03em',
                              padding: '5px 10px', textAlign: 'left', verticalAlign: 'middle',
                            }}
                          >
                            <Tooltip title={phase.name}>
                              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', lineHeight: 1.3 }}>
                                {phase.name}
                              </Box>
                            </Tooltip>
                          </Box>
                        )}
                        <Box
                          component="th"
                          scope="row"
                          sx={{
                            position: 'sticky', left: PHASE_W, zIndex: 1,
                            width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: DATA_ROW_H,
                            background: rowBg,
                            borderRight: `1px solid ${T.ln}`, borderBottom: bottomBorder,
                            padding: '5px 12px', textAlign: 'left', verticalAlign: 'middle',
                          }}
                        >
                          <Tooltip title={b.name}>
                            <Box
                              sx={{
                                fontSize: 12.5, fontWeight: 600, color: T.tx,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {b.name}
                            </Box>
                          </Tooltip>
                          {!mapped && (
                            <Box sx={{ fontSize: 9.5, color: T.dm2 }}>
                              {t('recipientMatrix.notMappedShort')}
                            </Box>
                          )}
                        </Box>
                        {departmentOptions.map((dept) => {
                          const active = mapped && (b.recipients?.departments.includes(dept) ?? false);
                          return (
                            <MatrixCell
                              key={`${b.id}-${dept}`}
                              mapped={mapped}
                              active={active}
                              bottomBorder={bottomBorder}
                              disabledTitle={t('recipientMatrix.notMappedTooltip')}
                              onClick={() => handleCellClick(b, dept)}
                            />
                          );
                        })}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px', mt: '10px', fontSize: 11, color: T.dm2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Box sx={{
                  width: 16, height: 16, borderRadius: '50%', background: T.prSoft,
                  border: `1px solid ${T.prLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: T.pr,
                }}
                >
                  <Icon name="check" size={9} />
                </Box>
                {t('recipientMatrix.legendActive')}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Box sx={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: `repeating-linear-gradient(45deg, ${T.ln2}, ${T.ln2} 2px, transparent 2px, transparent 5px)`,
                }}
                />
                {t('recipientMatrix.legendUnmapped')}
              </Box>
            </Box>
          </motion.div>
        )}
      </ModalShell>

      {pending && (
        <ConfirmDialog
          title={t(pending.adding ? 'recipientMatrix.addTitle' : 'recipientMatrix.removeTitle')}
          message={t(pending.adding ? 'recipientMatrix.addMessage' : 'recipientMatrix.removeMessage', {
            dept: pending.dept,
            artifact: pending.block.name,
          })}
          confirmLabel={t(pending.adding ? 'recipientMatrix.add' : 'recipientMatrix.remove')}
          cancelLabel={t('recipientMatrix.cancel')}
          danger={!pending.adding}
          busy={replaceRecipients.isPending}
          onCancel={() => setPending(null)}
          onConfirm={confirmToggle}
        />
      )}
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', color: T.dm2, fontSize: 13 }}>
      {text}
    </Box>
  );
}

/**
 * 셀 하나. mapped(artifact 매핑 여부)에 따라 클릭 가능 여부가 갈리고, active(recipient
 * 여부)에 따라 표식이 바뀐다.
 *
 * hover는 이 셀에서만 일어난다(사용자 요청 — 행/열로 번지지 않는다) — 그래서 상태를 JS로
 * 들고 있지 않고 `&:hover`만으로 처리한다. td 안에 tile(rmTile)을 따로 두고, hover 시
 * **tile 전체**가 위로 떠오르며(translateY + scale) 진짜 카드 그림자(T.shLg)를 얻는다 —
 * 표식 원(rmPop)만 커지는 게 아니라 그 밑 배경 자체가 입체적으로 튀어나오는 느낌을
 * 주기 위해서다(사용자 요청). 표식 자체는 그 tile 안에서 체크↔X(또는 ＋)로 한 번 더
 * 크로스페이드된다. block의 recipient 여부(active)가 실제로 바뀔 때만 AnimatePresence로
 * 원 자체가 등장/소멸한다.
 */
function MatrixCell({
  mapped, active, bottomBorder, disabledTitle, onClick,
}: {
  mapped: boolean;
  active: boolean;
  /** phase 그룹의 마지막 행이면 PHASE_BORDER, 아니면 기본 grid 선(사용자 요청). */
  bottomBorder: string;
  disabledTitle: string;
  onClick: () => void;
}) {
  const cell = (
    <Box
      component="td"
      onClick={mapped ? onClick : undefined}
      sx={{
        position: 'relative',
        width: COL_W, minWidth: COL_W, height: DATA_ROW_H,
        borderRight: `1px solid ${T.ln}`, borderBottom: bottomBorder,
        textAlign: 'center', verticalAlign: 'middle',
        cursor: mapped ? 'pointer' : 'not-allowed',
        userSelect: 'none',
        padding: '4px',
        '&:active .rmTile': mapped ? { transform: 'translateY(0) scale(0.95)', boxShadow: T.shXs } : undefined,
        // tile 전체가 뜨는 진짜 입체 효과 — 원(rmPop)은 그 안에서 한 번 더 반응한다.
        '&:hover .rmTile': mapped ? {
          transform: 'translateY(-4px) scale(1.06)',
          boxShadow: T.shLg,
          zIndex: 6,
        } : undefined,
        '&:hover .rmTile.rmTileOn': { background: T.dangerSoft, borderColor: T.dangerLine },
        '&:hover .rmTile.rmTileOff': { background: T.prSoft, borderColor: T.prLine },
        '&:hover .rmPop': mapped ? { transform: 'scale(1.1)' } : undefined,
        '&:hover .rmIconOn': { opacity: 0 },
        '&:hover .rmIconOff': { opacity: 1 },
      }}
    >
      <Box
        className={`rmTile${active ? ' rmTileOn' : ' rmTileOff'}`}
        sx={{
          width: '100%', height: '100%', borderRadius: `${R.sm}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: !mapped ? T.sf3 : active ? T.prSoft : 'transparent',
          border: `1px solid ${!mapped ? 'transparent' : active ? T.prLine : 'transparent'}`,
          opacity: mapped ? 1 : 0.55,
          transition: 'transform .24s cubic-bezier(.34,1.56,.64,1), box-shadow .24s cubic-bezier(.34,1.56,.64,1), background .15s ease, border-color .15s ease, opacity .15s ease',
        }}
      >
        {!mapped ? (
          <Box sx={{
            width: 14, height: 14, borderRadius: '50%',
            background: `repeating-linear-gradient(45deg, ${T.ln2}, ${T.ln2} 2px, transparent 2px, transparent 5px)`,
          }}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {active ? (
              <motion.div
                key="on"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={MOTION.press}
                className="rmPop"
                style={{
                  position: 'relative', width: 22, height: 22, borderRadius: '50%',
                  background: T.pr, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform .18s cubic-bezier(.34,1.56,.64,1)',
                }}
              >
                <Box className="rmIconOn" sx={{ display: 'flex', transition: 'opacity .12s ease' }}>
                  <Icon name="check" size={11} />
                </Box>
                <Box
                  className="rmIconOff"
                  sx={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity .12s ease',
                  }}
                >
                  <Icon name="x" size={10} />
                </Box>
              </motion.div>
            ) : (
              <motion.div
                key="off"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={MOTION.fade}
                className="rmPop"
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `1px dashed ${T.ln3}`, color: T.dm2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform .18s cubic-bezier(.34,1.56,.64,1), color .15s ease',
                }}
              >
                <Box
                  className="rmIconOff"
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, color: T.pr, transition: 'opacity .12s ease',
                  }}
                >
                  <Icon name="plus" size={11} />
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Box>
    </Box>
  );

  return mapped ? cell : <Tooltip title={disabledTitle}>{cell}</Tooltip>;
}
