import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ReleasePreviewDto, ReleasePreviewItemDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useDepartmentLabel } from '@/hooks/useDepartmentLabel';
import { CURSOR_POINTER, FONT_MONO, R, T, TNUM } from '@/theme/tokens';

/** nodeId → (sourceNodeId → versionRef | null) */
type SourceSelection = Record<string, Record<string, string | null>>;

interface Props {
  workflowName: string;
  projectId: string;
  preview: ReleasePreviewDto | null;
  loading?: boolean;
  saving?: boolean;
  /** 지금 겨냥한 부서. 빈 배열이면 All(전 부서). 다이얼로그를 열 때 고정되고, 다이얼로그
   *  안에서는 바꿀 수 없다(사용자 요청) — list view의 활성 chip이 유일한 소스다. */
  target: string[];
  onClose: () => void;
  onRelease: (p: { note: string; sources: SourceSelection; targetDepartments: string[] }) => void;
}

/**
 * Release 다이얼로그 (설계서 05장 §4).
 *
 * ★ 대상은 **전체 자동 포함**이다 — 사용자가 개별로 빼거나 넣을 수 없다.
 * ★ **`changed`인 항목만 source picker를 띄운다.** 바뀌지 않은 산출물은 직전 release의
 *   선택을 그대로 이어받으므로 다시 묻지 않는다(§4.2).
 * ★ publish된 적 없는 산출물도 그대로 포함하고 `Not published`로 표기한다 — 받는 쪽에는
 *   "아직 전달되지 않음"으로 보인다.
 * ★ release는 **철회할 수 없다** — 그래서 실행 전 반드시 confirm을 거치고, 요청 중에는
 *   버튼을 잠가 중복 클릭을 막는다.
 */
export function ReleaseDialog({
  workflowName, projectId, preview, loading, saving, target, onClose, onRelease,
}: Props) {
  const { t } = useTranslation();
  const { label: deptLabel } = useDepartmentLabel(projectId);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const [selection, setSelection] = useState<SourceSelection>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** null이면 "All" 탭 — 부서를 고르면 그 부서가 recipient인 항목만 본다(사용자 요청).
   * 탭 자체는 이번 release가 실제로 전달할 항목들의 recipients를 조사해서 만든다 —
   * 받는 user는 조사하지 않는다(부서만). */
  const [deptTab, setDeptTab] = useState<string | null>(null);

  const items = useMemo(() => preview?.items ?? [], [preview]);
  const changed = useMemo(() => items.filter((i) => i.changed), [items]);
  /** 탭 구성은 서버가 계산해 준다(스펙 §5.1) — 타겟 ∪ spillover. */
  const departments = useMemo(() => preview?.departments ?? [], [preview]);
  /**
   * All 탭은 **전 부서를 겨냥한 release일 때만** 그린다(사용자 요청).
   * 특정 부서 chip에서 release를 열면 그 부서와 recipient가 겹쳐 파생된 부서(spillover)
   * 탭만 있으면 되고, 거기에 All을 두면 "전체로 나가는 것"처럼 오해된다.
   * `target`이 빈 배열인 것이 곧 All이라는 뜻이다(스펙 §2).
   */
  const showAllTab = target.length === 0;
  /**
   * deptTab을 유효한 값으로 유지한다. All 탭이 없는데 deptTab이 null로 남으면
   * "필터 없음(전체 보기)"이 되어 이번 fix의 취지를 조용히 무력화하므로, All 탭이 없을
   * 때는 반드시 첫 부서로 떨어뜨린다. departments는 preview에서 비동기로 오고 target이
   * 바뀔 때마다 새로 계산되므로, 초기값이 아니라 이 값들이 바뀔 때마다 다시 검증해야
   * 한다(ArtifactListView의 activeDept 유지 패턴과 동일).
   */
  useEffect(() => {
    const ids = departments.map((d) => d.id);
    const stillValid = deptTab !== null && ids.includes(deptTab);
    if (stillValid) return;
    setDeptTab(showAllTab ? null : (ids[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllTab, departments.map((d) => d.id).join(',')]);
  const visibleItems = useMemo(
    () => (deptTab ? items.filter((i) => i.recipients.departments.includes(deptTab)) : items),
    [items, deptTab],
  );

  const pick = (nodeId: string, sourceNodeId: string, versionRef: string | null) =>
    setSelection((prev) => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] ?? {}), [sourceNodeId]: versionRef },
    }));

  const submit = () => {
    // 전부 끈 상태(=길이 0인데 사용자가 명시적으로 비운 경우)는 All과 구분되지 않으므로,
    // 후보가 있는데 아무것도 안 걸린 경우는 items.length === 0 으로 이미 막힌다.
    if (!note.trim()) { setNoteErr(true); return; }
    setConfirmOpen(true);
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={860}
      header={
        <>
          <Ey>{t('release.title')}</Ey>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '9px', mt: '2px' }}>
            <Box sx={{ fontSize: 17, fontWeight: 700 }}>{workflowName}</Box>
            {preview && (
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: T.pr, ...TNUM }}>
                v{preview.nextSeq}
              </Box>
            )}
          </Box>
        </>
      }
    >
      {/* 이 경고는 세 상태(로딩·빈 결과·정상) **전부**에서 보여야 한다. 이걸 빈 상태 분기
          안에 두면 사용자가 갇히고, 다이얼로그를 닫아 빠져나오면 조건 렌더
          (WorkflowPage의 `{releaseOpen && <ReleaseDialog/>}`) 때문에 입력한 release note까지
          사라진다. `preview`가 아직 없으면(loading) 보여줄 게 없어 그냥 건너뛴다.
          타겟은 다이얼로그를 열 때 list view의 활성 chip으로 고정되고, 다이얼로그 안에서는
          더 넣거나 뺄 수 없다(사용자 요청). 그 부서의 산출물 중 다른 부서와 recipient가
          겹치는 게 있으면 그 부서가 spillover 탭으로 추가되어 겹치는 산출물만 함께 나간다 —
          탭에 나올 부서와 그 안의 항목 모두 서버가 계산한다(스펙 §2.2, §5.1). */}
      {preview && (
        <>
          {preview.excludedNoRecipient > 0 && (
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: '7px', mb: '12px',
                background: T.warnSoft, border: `1px solid ${T.warnLine}`, borderRadius: `${R.sm}px`,
                padding: '8px 11px', fontSize: 12, color: T.tx2,
              }}
            >
              <Icon name="warn" />
              {t('release.noRecipientExcluded', { count: preview.excludedNoRecipient })}
            </Box>
          )}
        </>
      )}

      {loading || !preview ? (
        <Box sx={{ padding: '48px', textAlign: 'center', color: T.dm2, fontSize: 13 }}>Loading…</Box>
      ) : items.length === 0 ? (
        <Box sx={{ padding: '40px 16px', textAlign: 'center', color: T.dm }}>
          <Box sx={{ fontSize: 13.5, fontWeight: 600, color: T.tx, mb: '4px' }}>{t('release.nothingToRelease')}</Box>
          <Box sx={{ fontSize: 12, color: T.dm2, lineHeight: 1.6 }}>
            {t('release.nothingForTarget')}
          </Box>
        </Box>
      ) : (
        <>
          {/* 요약 — 전체 중 몇 개가 바뀌었는지 */}
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`,
              padding: '9px 12px', fontSize: 12.5, color: T.dm, mb: '14px',
            }}
          >
            <Icon name="send" />
            <Box>
              <Box component="span" sx={{ color: T.tx, fontWeight: 700, ...TNUM }}>{items.length}</Box>
              {' artifacts · '}
              <Box component="span" sx={{ color: T.pr, fontWeight: 700, ...TNUM }}>{changed.length}</Box>
              {' changed since the last release'}
            </Box>
          </Box>

          {/* 부서별 탭 — 이번 release가 실제로 어디로 가는지 부서 단위로 미리 볼 수 있게
              한다(사용자 요청). All 탭은 전 부서(target 빈 배열)를 겨냥했을 때만 첫 탭으로
              나오고 기본 선택이다 — 특정 부서 chip에서 열었을 때는 그 부서와 recipient가
              겹치는 spillover 부서 탭만 나오고, 그중 첫 부서가 기본 선택이다(사용자 요청). */}
          {departments.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px', mb: '10px' }}>
              {showAllTab && (
                <Box
                  component="button"
                  type="button"
                  disabled={saving}
                  onClick={() => setDeptTab(null)}
                  sx={{
                    fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: `${R.pill}px`,
                    cursor: CURSOR_POINTER, transition: '.14s',
                    background: deptTab === null ? T.pr : T.sf,
                    color: deptTab === null ? '#fff' : T.dm,
                    border: `1px solid ${deptTab === null ? T.pr : T.ln2}`,
                    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
                  }}
                >
                  All
                </Box>
              )}
              {departments.map((d) => (
                <Box
                  key={d.id}
                  component="button"
                  type="button"
                  disabled={saving}
                  onClick={() => setDeptTab(d.id)}
                  title={d.isTarget ? undefined : t('release.overlapTab')}
                  sx={{
                    fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: `${R.pill}px`,
                    cursor: CURSOR_POINTER, transition: '.14s', fontFamily: 'inherit',
                    background: deptTab === d.id ? T.pr : T.sf,
                    color: deptTab === d.id ? '#fff' : T.dm,
                    border: `1px solid ${deptTab === d.id ? T.pr : d.isTarget ? T.ln2 : T.warnLine}`,
                    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
                  }}
                >
                  {deptLabel(d.id)}
                  {!d.isTarget && (
                    <Box component="span" sx={{ ml: '5px', fontSize: 10, opacity: 0.85 }}>
                      · {t('release.overlapTab')}
                    </Box>
                  )}
                  <Box component="span" sx={{ ml: '5px', fontSize: 10, opacity: 0.7, ...TNUM }}>
                    {d.itemCount}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ maxHeight: 380, overflowY: 'auto', mb: '16px' }}>
            {visibleItems.length === 0 ? (
              <Box sx={{ padding: '20px 4px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
                Nothing goes to {deptTab ? deptLabel(deptTab) : 'anyone'} in this release.
              </Box>
            ) : (
              visibleItems.map((item) => (
                <ReleaseRow
                  key={item.nodeId}
                  item={item}
                  selection={selection[item.nodeId] ?? {}}
                  onPick={(sourceNodeId, ref) => pick(item.nodeId, sourceNodeId, ref)}
                  deptLabel={deptLabel}
                />
              ))
            )}
          </Box>

          <Box sx={{ mb: '6px' }}>
            <Ey sx={{ mb: '6px' }}>{t('release.note')}</Ey>
            <Box
              component="textarea"
              value={note}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setNote(e.target.value); setNoteErr(false); }}
              rows={3}
              placeholder="What is going out in this release?"
              sx={{
                width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13,
                padding: '9px 11px', borderRadius: `${R.sm}px`, background: T.sf,
                color: T.tx, lineHeight: 1.6,
                border: `1px solid ${noteErr ? T.danger : T.ln2}`,
                '&:focus': { outline: 'none', borderColor: T.pr, boxShadow: `0 0 0 3px ${T.ring}` },
              }}
            />
            {noteErr && (
              <Box sx={{ fontSize: 11.5, color: T.danger, mt: '5px' }}>{t('release.noteRequired')}</Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', mt: '14px' }}>
            <SirenButton variant="ghost" onClick={onClose} disabled={saving}>Cancel</SirenButton>
            <SirenButton variant="primary" onClick={submit} disabled={saving}>
              <Icon name="send" /> {saving ? 'Releasing…' : t('release.title')}
            </SirenButton>
          </Box>
        </>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title={t('release.confirmTitle')}
          message={t('release.confirmMessage')}
          confirmLabel={t('release.title')}
          danger={false}
          busy={saving}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onRelease({ note: note.trim(), sources: selection, targetDepartments: target });
          }}
        />
      )}
    </ModalShell>
  );
}

/** 표의 한 줄. 변경된 항목만 배경으로 강조하고 source picker를 띄운다. */
function ReleaseRow({
  item, selection, onPick, deptLabel,
}: {
  item: ReleasePreviewItemDto;
  selection: Record<string, string | null>;
  onPick: (sourceNodeId: string, versionRef: string | null) => void;
  deptLabel: (deptId: string) => string;
}) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        // 이전 release 대비 바뀐 행만 단일 하이라이트 — 신규/변경을 색으로 나누지 않는다.
        background: item.changed ? T.changed : 'transparent',
        border: `1px solid ${item.changed ? T.changedLine : T.ln}`,
        borderRadius: `${R.sm}px`, padding: '10px 12px', mb: '7px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <NetworkTag network={item.network} />
        <Box sx={{ fontSize: 13, fontWeight: 600, minWidth: 0, flex: 1 }}>{item.artifactName}</Box>

        {item.published ? (
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, ...TNUM }}>
            {item.published.versionLabel}
          </Box>
        ) : (
          <Badge color={T.dm2} bg={T.sf2} borderColor={T.ln}>{t('artifact.notPublished')}</Badge>
        )}

        {item.changed && <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>{t('release.changed')}</Badge>}
        {item.lookupFailed && (
          <Box title="The owning service could not be reached — SIREN's last known value is used." sx={{ color: T.warn, display: 'inline-flex' }}>
            <Icon name="warn" />
          </Box>
        )}
      </Box>

      {/* 수신 부서 — 이 산출물이 누구에게 가는가 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', mt: '7px', flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 10.5, color: T.dm2, fontWeight: 700, letterSpacing: '0.03em' }}>TO</Box>
        {item.recipients.departments.length || item.recipients.users.length ? (
          <>
            {item.recipients.departments.map((d) => (
              <Box key={d} sx={{ fontSize: 10.5, color: T.dm, background: T.sf3, padding: '2px 7px', borderRadius: `${R.pill}px` }}>
                {deptLabel(d)}
              </Box>
            ))}
            {item.recipients.users.length > 0 && (
              <Box sx={{ fontSize: 10.5, color: T.dm2 }}>+{item.recipients.users.length} member(s)</Box>
            )}
          </>
        ) : (
          <Box sx={{ fontSize: 10.5, color: T.dm2 }}>No recipient</Box>
        )}
      </Box>

      {/* source — changed인 항목만 고르게 하고, 나머지는 이어받는다는 사실만 알려 준다 */}
      {item.sources.length > 0 && (
        <Box sx={{ mt: '8px', pt: '8px', borderTop: `1px dashed ${T.ln}` }}>
          {item.changed ? (
            item.sources.map((s) => {
              const current = selection[s.nodeId] !== undefined
                ? selection[s.nodeId]
                : (s.selected?.versionRef ?? null);
              return (
                <Box key={s.nodeId} sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '5px' }}>
                  <Box sx={{ fontSize: 11, color: T.dm2, minWidth: 44 }}>FROM</Box>
                  <Box sx={{ fontSize: 11.5, color: T.tx2, flex: 1, minWidth: 0 }}>{s.artifactName}</Box>
                  {s.candidates.length ? (
                    <Box
                      component="select"
                      value={current ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        onPick(s.nodeId, e.target.value || null)
                      }
                      sx={{
                        fontFamily: FONT_MONO, fontSize: 11.5, padding: '3px 7px',
                        borderRadius: `${R.xs}px`, border: `1px solid ${T.ln2}`,
                        background: T.sf, color: T.tx, cursor: CURSOR_POINTER,
                        '& option': { background: T.sf, color: T.tx },
                      }}
                    >
                      {s.candidates.map((c) => (
                        <option key={c.versionRef ?? c.versionLabel} value={c.versionRef ?? ''}>
                          {c.versionLabel}
                        </option>
                      ))}
                    </Box>
                  ) : (
                    // 그 source가 한 번도 publish된 적 없다 — release는 막지 않는다.
                    <Box sx={{ fontSize: 11, color: T.dm2, fontStyle: 'italic' }}>
                      {t('release.sourceNone')}
                    </Box>
                  )}
                </Box>
              );
            })
          ) : (
            <Box sx={{ fontSize: 11, color: T.dm2 }}>{t('release.carriedOver')}</Box>
          )}
        </Box>
      )}
    </Box>
  );
}
