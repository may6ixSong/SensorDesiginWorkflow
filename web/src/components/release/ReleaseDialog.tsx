import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ReleasePreviewDto, ReleasePreviewItemDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { CURSOR_POINTER, FONT_MONO, R, T, TIER_COLOR, TNUM } from '@/theme/tokens';

/** blockId → (sourceBlockId → versionRef | null) */
type SourceSelection = Record<string, Record<string, string | null>>;

interface Props {
  workflowName: string;
  preview: ReleasePreviewDto | null;
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onRelease: (p: { note: string; sources: SourceSelection }) => void;
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
export function ReleaseDialog({ workflowName, preview, loading, saving, onClose, onRelease }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const [selection, setSelection] = useState<SourceSelection>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const items = preview?.items ?? [];
  const changed = useMemo(() => items.filter((i) => i.changed), [items]);

  const pick = (blockId: string, sourceBlockId: string, versionRef: string | null) =>
    setSelection((prev) => ({
      ...prev,
      [blockId]: { ...(prev[blockId] ?? {}), [sourceBlockId]: versionRef },
    }));

  const submit = () => {
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
      {loading || !preview ? (
        <Box sx={{ padding: '48px', textAlign: 'center', color: T.dm2, fontSize: 13 }}>Loading…</Box>
      ) : items.length === 0 ? (
        <Box sx={{ padding: '40px 16px', textAlign: 'center', color: T.dm }}>
          <Box sx={{ fontSize: 13.5, fontWeight: 600, color: T.tx, mb: '4px' }}>Nothing to release</Box>
          <Box sx={{ fontSize: 12, color: T.dm2, lineHeight: 1.6 }}>
            No block on this canvas has an artifact mapped yet.
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

          <Box sx={{ maxHeight: 380, overflowY: 'auto', mb: '16px' }}>
            {items.map((item) => (
              <ReleaseRow
                key={item.blockId}
                item={item}
                selection={selection[item.blockId] ?? {}}
                onPick={(sourceBlockId, ref) => pick(item.blockId, sourceBlockId, ref)}
              />
            ))}
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
            onRelease({ note: note.trim(), sources: selection });
          }}
        />
      )}
    </ModalShell>
  );
}

/** 표의 한 줄. 변경된 항목만 배경으로 강조하고 source picker를 띄운다. */
function ReleaseRow({
  item, selection, onPick,
}: {
  item: ReleasePreviewItemDto;
  selection: Record<string, string | null>;
  onPick: (sourceBlockId: string, versionRef: string | null) => void;
}) {
  const { t } = useTranslation();
  const tier = TIER_COLOR[item.tier];

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
        <Box
          sx={{
            fontSize: 10, fontWeight: 700, color: tier.fg, background: tier.bg,
            padding: '2px 6px', borderRadius: `${R.xs}px`, flexShrink: 0,
          }}
        >
          {item.tier}
        </Box>
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
                {d}
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
              const current = selection[s.blockId] !== undefined
                ? selection[s.blockId]
                : (s.selected?.versionRef ?? null);
              return (
                <Box key={s.blockId} sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '5px' }}>
                  <Box sx={{ fontSize: 11, color: T.dm2, minWidth: 44 }}>FROM</Box>
                  <Box sx={{ fontSize: 11.5, color: T.tx2, flex: 1, minWidth: 0 }}>{s.artifactName}</Box>
                  {s.candidates.length ? (
                    <Box
                      component="select"
                      value={current ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        onPick(s.blockId, e.target.value || null)
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
