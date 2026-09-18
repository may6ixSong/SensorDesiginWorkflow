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

const ROW_HEADER_W = 176;
const COL_W = 132;
const PHASE_ROW_H = 30;
const BLOCK_ROW_H = 54;
const DATA_ROW_H = 42;

interface Props {
  workflowId: string;
  blocks: BlockDto[];
  phases: WorkflowPhase[];
  /** 그 과제에 등록된 부서(Project.departments) — 행이 된다. */
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
 * ★ 행 = 그 과제의 부서, 열 = 이 workflow가 **주는**(intent === 'own') artifact뿐이다 —
 *   받는(received) 쪽은 recipient 개념 자체가 없다.
 * ★ 셀 하나하나가 그 block의 recipient(AccessGrant.departments) 토글 스위치다. 클릭은
 *   바로 반영되지 않고 항상 confirm을 거친다 — 실수로 전달 대상을 바꾸면 알림이 엉뚱한
 *   부서로 나가기 때문이다.
 * ★ replaceRecipients는 **완전 교체**라(부분 병합 아님, blocks.service.ts
 *   replaceRecipients) departments만 바꿀 때도 기존 users는 그대로 실어 보내야 한다.
 */
export function RecipientMatrixDialog({ workflowId, blocks, phases, departmentOptions, onClose }: Props) {
  const { t } = useTranslation();
  const m = useMotion();
  const replaceRecipients = useReplaceBlockRecipients(workflowId);

  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [hoverDept, setHoverDept] = useState<string | null>(null);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);

  const orderedPhases = useMemo(() => sortSchedule(phases), [phases]);

  /** 내가 주는 artifact만 — phase 순서 → 이름 순으로 정렬해 열을 만든다. */
  const columns = useMemo(() => {
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

  /** 연속된 같은 phase의 열을 하나의 group header(colSpan)로 묶는다. */
  const phaseGroups = useMemo(() => {
    const groups: { phaseId: string; name: string; count: number }[] = [];
    for (const b of columns) {
      const last = groups[groups.length - 1];
      const name = phases.find((p) => p.id === b.phaseId)?.name ?? '—';
      if (last && last.phaseId === b.phaseId) last.count += 1;
      else groups.push({ phaseId: b.phaseId, name, count: 1 });
    }
    return groups;
  }, [columns, phases]);

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
        {columns.length === 0 ? (
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
                onMouseLeave={() => { setHoverDept(null); setHoverBlockId(null); }}
                sx={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}
              >
                <Box component="thead">
                  <Box component="tr">
                    <Box
                      component="th"
                      rowSpan={2}
                      sx={{
                        position: 'sticky', top: 0, left: 0, zIndex: 4,
                        width: ROW_HEADER_W, minWidth: ROW_HEADER_W,
                        background: T.sf3, borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
                        fontSize: 11, fontWeight: 700, color: T.dm2, letterSpacing: '0.03em',
                        padding: '8px 12px', textAlign: 'left', verticalAlign: 'bottom',
                      }}
                    >
                      {t('recipientMatrix.departmentColumn')}
                    </Box>
                    {phaseGroups.map((g) => (
                      <Box
                        component="th"
                        key={`${g.phaseId}-${g.name}`}
                        colSpan={g.count}
                        sx={{
                          position: 'sticky', top: 0, zIndex: 2,
                          background: T.sf2, borderBottom: `1px solid ${T.ln}`, borderRight: `1px solid ${T.ln}`,
                          fontSize: 10.5, fontWeight: 700, color: T.dm2, letterSpacing: '0.04em',
                          textTransform: 'uppercase', padding: '5px 8px', height: PHASE_ROW_H,
                          textAlign: 'left',
                        }}
                      >
                        {g.name}
                      </Box>
                    ))}
                  </Box>
                  <Box component="tr">
                    {columns.map((b) => {
                      const hovered = hoverBlockId === b.id;
                      return (
                        <Box
                          component="th"
                          key={b.id}
                          onMouseEnter={() => setHoverBlockId(b.id)}
                          onMouseLeave={() => setHoverBlockId((v) => (v === b.id ? null : v))}
                          sx={{
                            position: 'sticky', top: PHASE_ROW_H, zIndex: 2,
                            width: COL_W, minWidth: COL_W, height: BLOCK_ROW_H,
                            background: hovered ? T.prSoft : T.sf,
                            borderBottom: `1px solid ${T.ln}`, borderRight: `1px solid ${T.ln}`,
                            padding: '7px 8px', verticalAlign: 'middle',
                            transition: 'background .15s ease',
                          }}
                        >
                          <Tooltip title={b.name}>
                            <Box
                              sx={{
                                fontSize: 11.5, fontWeight: 600, color: T.tx,
                                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3,
                              }}
                            >
                              {b.name}
                            </Box>
                          </Tooltip>
                          {!b.artifactId && (
                            <Box sx={{ fontSize: 9.5, color: T.dm2, mt: '2px' }}>
                              {t('recipientMatrix.notMappedShort')}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>

                <Box component="tbody">
                  {departmentOptions.map((dept, rowIdx) => {
                    const rowHovered = hoverDept === dept;
                    const rowBg = rowIdx % 2 === 0 ? T.sf : T.sf2;
                    return (
                      <Box
                        component="tr"
                        key={dept}
                        onMouseEnter={() => setHoverDept(dept)}
                        onMouseLeave={() => setHoverDept((v) => (v === dept ? null : v))}
                      >
                        <Box
                          component="th"
                          scope="row"
                          onMouseEnter={() => { setHoverDept(dept); setHoverBlockId(null); }}
                          sx={{
                            position: 'sticky', left: 0, zIndex: 1,
                            width: ROW_HEADER_W, minWidth: ROW_HEADER_W, height: DATA_ROW_H,
                            background: rowHovered ? T.prSoft : rowBg,
                            borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
                            fontSize: 12.5, fontWeight: 600, color: T.tx,
                            padding: '0 12px', textAlign: 'left',
                            transition: 'background .15s ease',
                          }}
                        >
                          {dept}
                        </Box>
                        {columns.map((b) => {
                          const mapped = Boolean(b.artifactId);
                          const active = mapped && (b.recipients?.departments.includes(dept) ?? false);
                          const colHovered = hoverBlockId === b.id;
                          return (
                            <MatrixCell
                              key={`${dept}-${b.id}`}
                              mapped={mapped}
                              active={active}
                              ambient={rowHovered || colHovered}
                              exact={rowHovered && colHovered}
                              disabledTitle={t('recipientMatrix.notMappedTooltip')}
                              onMouseEnter={() => { setHoverDept(dept); setHoverBlockId(b.id); }}
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
 * 여부)에 따라 표식이 바뀐다. hover 시 배경이 바뀌고, 표식은 등장/소멸 시 scale+fade로
 * 부드럽게 전환된다(사용자 요청 — "애플 감성").
 */
function MatrixCell({
  mapped, active, ambient, exact, disabledTitle, onMouseEnter, onClick,
}: {
  mapped: boolean;
  active: boolean;
  /** 이 셀의 행 또는 열이 hover 중 — Excel처럼 십자 띠로 은은하게 강조한다. */
  ambient: boolean;
  /** 마우스가 정확히 이 셀 위에 있음 — 표식 자체(체크↔X, +)가 반응한다. */
  exact: boolean;
  disabledTitle: string;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const cell = (
    <Box
      component="td"
      onMouseEnter={onMouseEnter}
      onClick={mapped ? onClick : undefined}
      sx={{
        width: COL_W, minWidth: COL_W, height: DATA_ROW_H,
        borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
        textAlign: 'center', verticalAlign: 'middle',
        cursor: mapped ? 'pointer' : 'not-allowed',
        userSelect: 'none',
        background: !mapped
          ? T.sf3
          : active
            ? T.prSoft
            : (ambient ? T.sf3 : 'transparent'),
        boxShadow: active && exact ? `inset 0 0 0 1px ${T.dangerLine}` : 'none',
        opacity: mapped ? 1 : 0.55,
        transition: 'background .15s ease, opacity .15s ease, box-shadow .15s ease',
        '&:active': mapped ? { transform: 'scale(0.93)' } : undefined,
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
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: exact ? T.dangerSoft : T.prSoft,
                  border: `1px solid ${exact ? T.dangerLine : T.prLine}`,
                  color: exact ? T.danger : T.pr,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s ease, border-color .15s ease, color .15s ease',
                }}
              >
                <Icon name={exact ? 'x' : 'check'} size={exact ? 10 : 11} />
              </motion.div>
            ) : (
              <motion.div
                key="off"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: exact ? 1 : 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={MOTION.fade}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `1px dashed ${T.ln3}`, color: T.dm2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name="plus" size={11} />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Box>
    </Box>
  );

  return mapped ? cell : <Tooltip title={disabledTitle}>{cell}</Tooltip>;
}
