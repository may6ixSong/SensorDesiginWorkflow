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

const ROW_HEADER_W = 220;
const COL_W = 120;
const HEADER_ROW_H = 40;
const DATA_ROW_H = 44;

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

/**
 * "Artifact별 전달 부서" 매트릭스 — workflow toolbar(canvas/list view가 공유하는 헤더)의
 * table 아이콘 버튼에서 연다(사용자 요청).
 *
 * ★ 행 = 이 workflow가 **주는**(intent === 'own') artifact뿐이다 — 받는(received) 쪽은
 *   recipient 개념 자체가 없다. 열 = 그 과제의 부서(사용자 요청: 부서가 열).
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

  const phaseNameOf = (phaseId: string) => phases.find((p) => p.id === phaseId)?.name ?? '—';

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
                // 셀이 hover에서 튀어나올 때 옆 셀 border 위로 그려지게끔 여유를 둔다.
                padding: '1px',
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
                        position: 'sticky', top: 0, left: 0, zIndex: 4,
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
                    return (
                      <Box component="tr" key={b.id}>
                        <Box
                          component="th"
                          scope="row"
                          sx={{
                            position: 'sticky', left: 0, zIndex: 1,
                            width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: DATA_ROW_H,
                            background: rowBg,
                            borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
                            padding: '5px 12px', textAlign: 'left', verticalAlign: 'middle',
                          }}
                        >
                          <Box sx={{ fontSize: 9.5, fontWeight: 700, color: T.dm2, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                            {phaseNameOf(b.phaseId)}
                          </Box>
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
 * 들고 있지 않고 `&:hover`만으로 처리한다. 안쪽 원(pop)이 살짝 떠오르며 그림자가 지는
 * "입체적으로 튀어나오는" 느낌을 주고(사용자 요청), 체크↔X/＋ 아이콘 전환도 같은
 * hover만으로 크로스페이드된다. block의 recipient 여부(active)가 실제로 바뀔 때만
 * AnimatePresence로 원 자체가 등장/소멸한다.
 */
function MatrixCell({
  mapped, active, disabledTitle, onClick,
}: {
  mapped: boolean;
  active: boolean;
  disabledTitle: string;
  onClick: () => void;
}) {
  const popSx = {
    position: 'relative' as const,
    width: 24, height: 24, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, background .15s ease, border-color .15s ease',
  };

  const cell = (
    <Box
      component="td"
      onClick={mapped ? onClick : undefined}
      className="rmCell"
      sx={{
        width: COL_W, minWidth: COL_W, height: DATA_ROW_H,
        borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
        textAlign: 'center', verticalAlign: 'middle',
        cursor: mapped ? 'pointer' : 'not-allowed',
        userSelect: 'none',
        background: !mapped ? T.sf3 : 'transparent',
        opacity: mapped ? 1 : 0.55,
        transition: 'opacity .15s ease',
        '&:active .rmPop': mapped ? { transform: 'translateY(0) scale(0.92)' } : undefined,
        // 셀 자체가 아니라 안쪽 pop만 떠오른다 — grid 테두리는 그대로 고정된다.
        '&:hover .rmPop': mapped ? { transform: 'translateY(-2px) scale(1.18)', boxShadow: T.shMd, zIndex: 3 } : undefined,
        '&:hover .rmIconOn': { opacity: 0 },
        '&:hover .rmIconOff': { opacity: 1 },
        '&:hover .rmPopOn': { background: T.dangerSoft, borderColor: T.dangerLine },
        '&:hover .rmPopOff': { background: T.prSoft, borderColor: T.prLine },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
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
                className="rmPop rmPopOn"
                style={{ ...popSx, background: T.prSoft, border: `1px solid ${T.prLine}`, color: T.pr }}
              >
                <Box className="rmIconOn" sx={{ display: 'flex', transition: 'opacity .12s ease' }}>
                  <Icon name="check" size={11} />
                </Box>
                <Box
                  className="rmIconOff"
                  sx={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, color: T.danger, transition: 'opacity .12s ease',
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
                className="rmPop rmPopOff"
                style={{ ...popSx, border: `1px dashed ${T.ln3}`, color: T.dm2 }}
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
