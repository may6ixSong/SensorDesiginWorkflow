import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ReleaseDto, ReleaseItemDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { fmtAt } from '@/lib/canvasModel';
import { CURSOR_POINTER, FONT_MONO, R, T, TIER_COLOR, TNUM } from '@/theme/tokens';

interface Props {
  workflowName: string;
  releases: ReleaseDto[];
  /** 부서별 필터 뷰 후보 — 그 과제에 등록된 부서. */
  departmentOptions: string[];
  /** 산출물 상세의 release 마커를 눌러 들어왔을 때 — 그 release를 처음부터 골라서 연다. */
  initialSelectedId?: string | null;
  onClose: () => void;
  onOpenArtifact?: (blockId: string) => void;
}

/**
 * Release history (설계서 05장 §7).
 *
 * 세 가지 보기를 한 다이얼로그 안에 둔다:
 *   ① workflow별 목록 → 그 시점의 **표**. 캔버스는 재현하지 않는다(스냅샷을 안 찍는다).
 *   ② 부서별 필터 — "우리 부서가 받은 것"만 가로질러 본다.
 *   ③ 산출물별 타임라인은 여기 없다 — 그건 산출물 상세의 버전 트리 위에 마커로 붙는다.
 *
 * ★ 마스킹은 **열람 시점 기준**이다 — 과거 release를 열어도 "지금 이 사람의 권한"으로
 *   판정되어, 볼 수 없는 항목은 버전·링크가 비어서 온다(item.masked).
 */
export function ReleaseHistoryDialog({
  workflowName, releases, departmentOptions, initialSelectedId, onClose, onOpenArtifact,
}: Props) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? releases[0]?.id ?? null);
  /** null이면 전체. 고르면 그 부서가 받은 항목만 남긴다. */
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const selected = useMemo(
    () => releases.find((r) => r.id === selectedId) ?? null,
    [releases, selectedId],
  );

  /** 부서 필터를 켜면 그 부서가 recipient로 잡힌 항목만 남는다. */
  const visibleItems = useMemo(() => {
    if (!selected) return [];
    if (!deptFilter) return selected.items;
    return selected.items.filter((i) => i.recipients.departments.includes(deptFilter));
  }, [selected, deptFilter]);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={940}
      header={
        <>
          <Ey>{t('release.history')}</Ey>
          <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>{workflowName}</Box>
        </>
      }
    >
      {releases.length === 0 ? (
        <Box sx={{ padding: '44px 16px', textAlign: 'center', color: T.dm2, fontSize: 13 }}>
          No release yet.
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: '14px', minHeight: 380 }}>
          {/* ① 목록 */}
          <Box sx={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.ln}`, pr: '12px', overflowY: 'auto', maxHeight: 460 }}>
            {releases.map((r) => {
              const on = r.id === selectedId;
              const changedCount = r.items.filter((i) => i.changed).length;
              return (
                <Box
                  key={r.id}
                  component="button"
                  onClick={() => setSelectedId(r.id)}
                  sx={{
                    display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                    background: on ? T.prSoft : 'transparent',
                    border: `1px solid ${on ? T.prLine : 'transparent'}`,
                    borderRadius: `${R.sm}px`, padding: '9px 10px', mb: '5px', cursor: CURSOR_POINTER,
                    '&:hover': { background: on ? T.prSoft : T.sf2 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: on ? T.pr : T.tx, ...TNUM }}>
                      {r.label}
                    </Box>
                    <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{fmtAt(r.releasedAt).slice(0, 10)}</Box>
                  </Box>
                  <Box sx={{ fontSize: 11, color: T.dm, mt: '3px', ...TNUM }}>
                    {r.items.length} artifacts
                    {changedCount > 0 && <Box component="span" sx={{ color: T.warn }}> · {changedCount} changed</Box>}
                  </Box>
                  {r.note && (
                    <Box
                      sx={{
                        fontSize: 11, color: T.dm2, mt: '3px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {r.note}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* ② 상세 표 */}
          <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: 460 }}>
            {selected && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mb: '10px', flexWrap: 'wrap' }}>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: T.pr, ...TNUM }}>
                    {selected.label}
                  </Box>
                  <Box sx={{ fontSize: 11.5, color: T.dm2, ...TNUM }}>{fmtAt(selected.releasedAt)}</Box>
                  <UserAvatar user={resolveUser(selected.releasedBy)} size={20} />
                  <Box sx={{ fontSize: 11.5, color: T.dm }}>
                    {resolveUser(selected.releasedBy)?.name ?? selected.releasedBy}
                  </Box>

                  <Box sx={{ flex: 1 }} />

                  {/* 부서별 필터 — "우리 부서가 받은 것"만 본다 */}
                  <Box
                    component="select"
                    value={deptFilter ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDeptFilter(e.target.value || null)}
                    sx={{
                      fontSize: 11.5, padding: '4px 8px', borderRadius: `${R.xs}px`,
                      border: `1px solid ${T.ln2}`, background: T.sf, color: T.tx,
                      cursor: CURSOR_POINTER, fontFamily: 'inherit',
                      '& option': { background: T.sf, color: T.tx },
                    }}
                  >
                    <option value="">All recipients</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Box>
                </Box>

                {selected.note && (
                  <Box
                    sx={{
                      fontSize: 12.5, color: T.tx2, lineHeight: 1.6, background: T.sf2,
                      border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, padding: '9px 11px', mb: '12px',
                    }}
                  >
                    {selected.note}
                  </Box>
                )}

                {visibleItems.length === 0 ? (
                  <Box sx={{ padding: '28px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
                    Nothing went to {deptFilter} in this release.
                  </Box>
                ) : (
                  visibleItems.map((item) => (
                    <HistoryRow key={item.blockId} item={item} onOpen={onOpenArtifact} />
                  ))
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </ModalShell>
  );
}

function HistoryRow({ item, onOpen }: { item: ReleaseItemDto; onOpen?: (blockId: string) => void }) {
  const { t } = useTranslation();
  const tier = TIER_COLOR[item.tier];

  return (
    <Box
      onClick={() => onOpen?.(item.blockId)}
      sx={{
        background: item.changed ? T.changed : T.sf,
        border: `1px solid ${item.changed ? T.changedLine : T.ln}`,
        borderRadius: `${R.sm}px`, padding: '10px 12px', mb: '7px',
        cursor: onOpen ? CURSOR_POINTER : 'default',
        '&:hover': onOpen ? { borderColor: T.ln2 } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 10, fontWeight: 700, color: tier.fg, background: tier.bg, padding: '2px 6px', borderRadius: `${R.xs}px` }}>
          {item.tier}
        </Box>
        <Box sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{item.artifactName}</Box>
        {item.phaseName && <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{item.phaseName}</Box>}

        {/* 열람 권한이 없으면 버전·링크가 응답에서 빠져서 온다 — 그 사실을 그대로 보여준다. */}
        {item.masked ? (
          <Box sx={{ color: T.dm2, display: 'inline-flex' }} title={t('artifact.noAccess')}>
            <Icon name="lock" />
          </Box>
        ) : item.published ? (
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, ...TNUM }}>
            {item.published.versionLabel}
          </Box>
        ) : (
          <Badge color={T.dm2} bg={T.sf2} borderColor={T.ln}>{t('artifact.notPublished')}</Badge>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', mt: '7px', flexWrap: 'wrap' }}>
        <Box sx={{ fontSize: 10.5, color: T.dm2, fontWeight: 700 }}>TO</Box>
        {item.recipients.departments.map((d) => (
          <Box key={d} sx={{ fontSize: 10.5, color: T.dm, background: T.sf3, padding: '2px 7px', borderRadius: `${R.pill}px` }}>
            {d}
          </Box>
        ))}
        {!item.recipients.departments.length && (
          <Box sx={{ fontSize: 10.5, color: T.dm2 }}>No recipient</Box>
        )}
      </Box>

      {item.sources.length > 0 && !item.masked && (
        <Box sx={{ mt: '7px', pt: '7px', borderTop: `1px dashed ${T.ln}` }}>
          {item.sources.map((s) => (
            <Box key={s.blockId} sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 11 }}>
              <Box sx={{ color: T.dm2, minWidth: 44 }}>FROM</Box>
              <Box sx={{ color: T.tx2, flex: 1, minWidth: 0 }}>{s.artifactName}</Box>
              <Box sx={{ fontFamily: FONT_MONO, color: s.selected ? T.tx2 : T.dm2, ...TNUM }}>
                {/* source가 미발행이면 받는 쪽에는 "아직 전달되지 않음"으로 보인다. */}
                {s.selected ? s.selected.versionLabel : t('release.notDelivered')}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
