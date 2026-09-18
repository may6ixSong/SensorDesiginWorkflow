import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Ey, SelectInput, TextArea } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { Location } from './Location';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useCreateReleaseItemFeedback, useRelease, useReleaseItemFeedback } from '@/api/hooks/useAssignments';
import { markReleaseRead } from '@/lib/releaseReadTracker';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyReleaseRowDto, ReleaseItemDto, ReleaseItemFeedbackStatus } from '@/types/domain';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * "이 release로 무엇이 어떻게 오갔는가" 한 장 (설계서 09장 §4).
 *
 * 목록 행에는 버전 라벨이 아예 실려 있지 않다 — 산출물별 열람 권한은 그 서비스에 라이브로
 * 물어봐야 정해지기 때문이다(01장 §4.2). 그 판정은 이 다이얼로그가 여는 `GET /releases/:id`
 * 한 건에 대해서만 돌고, 권한이 없는 행은 서버가 버전·링크·경로를 **비워서** 보낸다
 * (`masked: true`) — FE가 숨기는 게 아니라 응답에서 빠진다(01장 §5).
 *
 * 마스킹은 **열람 시점 기준**이라, 같은 release를 나중에 다시 열면 그때의 권한으로 다시
 * 판정된다(05장 §5).
 *
 * ★ "확인했다"의 유일한 기준이 여기다 — 이 다이얼로그가 열리는 순간(My Assignment의
 *   Inbox/Outbox든, bell 팝업이든 호출부가 어디든 상관없이) 그 release를 읽음으로
 *   기록한다(사용자 확정). 호출부가 각자 챙길 필요가 없도록 이 컴포넌트 자신이 마킹한다.
 */
export function ReleaseDetailDialog({
  row, onClose,
}: {
  row: MyReleaseRowDto;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { resolveUser } = useDirectory();
  const { data, isLoading, isError } = useRelease(row.id);
  const releasedBy = resolveUser(row.releasedBy);

  // 부서 필터 — "받은 release"에서, 내가 여러 부서에 속해 있을 때 그중 한 부서로
  // artifact 목록을 좁힌다(설계서 09장 §4.1, 사용자 확정). 낸(Outbox) release나 내가
  // 소속 부서 없이 받은 경우(개별 recipientUsers)는 필터를 아예 보여주지 않는다 —
  // viewerDepartments가 비면 전체 목록을 그대로 보여준다.
  const viewerDepartments = data?.viewerDepartments ?? [];
  const showDeptFilter = row.received && viewerDepartments.length > 0;
  const [selectedDept, setSelectedDept] = useState('');

  useEffect(() => {
    // 다이얼로그를 처음 열 때는 무조건 첫 번째 부서로 고정한다(사용자 확정).
    if (viewerDepartments.length && !viewerDepartments.includes(selectedDept)) {
      setSelectedDept(viewerDepartments[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.viewerDepartments]);

  const visibleItems = useMemo(() => {
    if (!data) return [];
    if (!showDeptFilter) return data.items;
    return data.items.filter((item) => item.recipients.departments.includes(selectedDept));
  }, [data, showDeptFilter, selectedDept]);

  useEffect(() => {
    markReleaseRead(user?.KnoxID ?? '', row.id);
    // row.id가 바뀌는 경우는 실질적으로 없다(호출부가 매번 새 컴포넌트를 마운트한다) —
    // 그래도 방어적으로 넣어둔다. user?.KnoxID는 시뮬레이션 대상이 바뀌면 같이 바뀐다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id, user?.KnoxID]);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={980}
      header={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* project name이 가장 중요한 식별 정보다(사용자 확정) — 맨 위, 가장 크고 진하게. */}
          <Box sx={{ fontSize: 16, fontWeight: 800, color: T.tx, overflowWrap: 'anywhere' }}>
            {row.projectName}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: T.pr }}>
              {row.label}
            </Box>
            <Box sx={{ fontSize: 14, fontWeight: 700 }}>{row.workflowAt.name}</Box>
            <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
              {canonicalDepartmentLabel(row.workflowAt.department)}
            </Badge>
            <DirectionBadges row={row} />
          </Box>
        </Box>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '14px' }}>
        <UserAvatar user={releasedBy} size={22} />
        <Box sx={{ fontSize: 12.5, fontWeight: 600 }}>{releasedBy?.name ?? row.releasedBy}</Box>
        <Box sx={{ fontSize: 11.5, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(row.releasedAt)}</Box>
      </Box>

      {/* release note — release 전체에 하나뿐이고 필수 입력이다(05장 §4.3). */}
      <Box sx={{ mb: '18px' }}>
        <Ey sx={{ mb: '6px' }}>Release note</Ey>
        <Box
          sx={{
            border: `1px solid ${T.ln}`, borderRadius: '10px', background: T.sf,
            padding: '11px 13px', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            color: row.note ? T.tx : T.dm2,
          }}
        >
          {row.note || 'No note'}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', mb: '7px' }}>
        <Ey sx={{ mb: 0 }}>Artifacts in this release</Ey>
        {showDeptFilter && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box sx={{ fontSize: 11, color: T.dm2 }}>Department</Box>
            <SelectInput
              value={selectedDept}
              onChange={setSelectedDept}
              options={viewerDepartments.map((d) => ({ value: d, label: canonicalDepartmentLabel(d) }))}
            />
          </Box>
        )}
      </Box>

      {isError ? (
        <Box
          sx={{
            border: `1px solid ${T.dangerLine}`, background: T.dangerSoft, color: T.danger,
            borderRadius: '10px', padding: '16px 18px', fontSize: 12.5,
          }}
        >
          Could not load this release.
        </Box>
      ) : isLoading || !data ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                height: 54, borderRadius: '10px', border: `1px solid ${T.ln}`, background: T.sf,
                animation: 'sirenPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleItems.map((item) => (
            <ItemCard
              key={item.blockId}
              item={item}
              releaseId={row.id}
              // feedback은 "받은 release"에서 지금 필터로 고른 그 부서에 대해서만이다
              // (사용자 확정) — 낸(Outbox) release나 필터가 없는 경우는 아예 렌더하지 않는다.
              feedbackDepartment={showDeptFilter ? selectedDept : null}
            />
          ))}
          {!visibleItems.length && (
            <Box sx={{ fontSize: 12, color: T.dm2, padding: '18px 0', textAlign: 'center' }}>
              {data.items.length ? 'No artifacts for this department.' : 'This release carried no mapped artifacts.'}
            </Box>
          )}
        </Box>
      )}
    </ModalShell>
  );
}

/** 같은 release가 나에게 "받은 것"이면서 "낸 것"일 수 있다 — 내 부서가 내 부서에 전달한 경우. */
function DirectionBadges({ row }: { row: MyReleaseRowDto }) {
  return (
    <>
      {row.received && (
        <Badge color={T.recv} bg={T.recvSoft} borderColor={T.recv}>RECEIVED</Badge>
      )}
      {row.published && (
        <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>PUBLISHED</Badge>
      )}
    </>
  );
}

/**
 * 한 산출물이 그 release에서 어떤 버전으로, 어디에서 와서, 누구에게 갔는지.
 *
 * ★ `Not published`와 `권한 없음`은 **절대 같은 화면을 쓰지 않는다**(04장 §4.3) —
 *   전자는 "아직 확정된 버전이 없다", 후자는 "있는지 없는지도 알려줄 수 없다"이고,
 *   둘을 같게 그리면 받는 쪽이 사실을 오해한다.
 */
function ItemCard({
  item, releaseId, feedbackDepartment,
}: {
  item: ReleaseItemDto;
  releaseId: string;
  /** null이면 feedback 섹션 자체를 렌더하지 않는다(Outbox 쪽 등, 사용자 확정 범위 밖). */
  feedbackDepartment: string | null;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${item.changed ? T.changedLine : T.ln}`,
        background: item.changed ? T.changed : T.sf,
        borderRadius: '10px', padding: '11px 13px',
        display: 'grid',
        gridTemplateColumns: 'minmax(210px, 1.4fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(140px, 1fr)',
        gap: '12px',
        alignItems: 'start',
        '@media (max-width: 900px)': { gridTemplateColumns: '1fr' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '3px' }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
            {item.artifactName}
          </Box>
          <NetworkTag network={item.network} />
          {item.firstTime && (
            <Badge color={T.info} bg={T.infoSoft} borderColor={T.infoLine}>FIRST</Badge>
          )}
        </Box>
        {item.phaseName && (
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '4px' }}>Phase · {item.phaseName}</Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Published version</Ey>
        {item.masked ? (
          <Box sx={{ fontSize: 11.5, color: T.dm2, fontStyle: 'italic' }}>
            No access — hidden
          </Box>
        ) : item.published ? (
          <>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>
              {item.published.versionLabel}
            </Box>
            {item.published.publishedAt && (
              <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>
                {fmtAt(item.published.publishedAt)}
              </Box>
            )}
            <Location viewUrl={item.published.viewUrl} hpcPath={item.published.hpcPath} />
          </>
        ) : (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Not published</Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Source</Ey>
        {!item.sources.length ? (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>—</Box>
        ) : (
          item.sources.map((s) => (
            <Box key={s.blockId} sx={{ mb: '5px' }}>
              <Box sx={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{s.artifactName}</Box>
              <Box
                sx={{
                  fontFamily: FONT_MONO, fontSize: 11,
                  color: s.selected ? T.tx2 : T.dm2,
                  fontStyle: s.selected ? 'normal' : 'italic',
                }}
              >
                {item.masked ? 'hidden' : s.selected ? s.selected.versionLabel : 'not delivered yet'}
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Recipients</Ey>
        <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {item.recipients.departments.map((d) => (
            <Badge key={d} color={T.dm} bg={T.sf3} borderColor={T.ln}>
              {canonicalDepartmentLabel(d)}
            </Badge>
          ))}
          {item.recipients.users.length > 0 && (
            <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
              +{item.recipients.users.length} user{item.recipients.users.length > 1 ? 's' : ''}
            </Badge>
          )}
          {!item.recipients.departments.length && !item.recipients.users.length && (
            <Box sx={{ fontSize: 11.5, color: T.dm2 }}>None</Box>
          )}
        </Box>
      </Box>

      {feedbackDepartment && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <ItemFeedback releaseId={releaseId} blockId={item.blockId} department={feedbackDepartment} />
        </Box>
      )}
    </Box>
  );
}

const FEEDBACK_STATUS_META: Record<ReleaseItemFeedbackStatus, { label: string; color: string; bg: string; line: string }> = {
  accepted: { label: 'Fully accepted', color: T.ok, bg: T.okSoft, line: T.okLine },
  partial: { label: 'Partially accepted', color: T.warn, bg: T.warnSoft, line: T.warnLine },
  blocked: { label: 'Cannot accept yet', color: T.danger, bg: T.dangerSoft, line: T.dangerLine },
};

/**
 * 한 부서가 이 산출물에 대해 남기는 상태/코멘트 이력(설계서 09장 §4.2). 다른 부서에는
 * 이 섹션 자체가 렌더되지 않는다 — department는 항상 지금 필터로 고른 값 하나뿐이다.
 *
 * ★ append-only다 — 새 항목을 추가할 뿐 기존 이력을 고치거나 지우지 않는다(Release 자체의
 *   철회 불가 원칙과 같다). "현재 상태"는 가장 최근 항목으로 본다.
 */
function ItemFeedback({
  releaseId, blockId, department,
}: {
  releaseId: string;
  blockId: string;
  department: string;
}) {
  const { resolveUser } = useDirectory();
  const { data, isLoading } = useReleaseItemFeedback(releaseId, blockId, department);
  const createFeedback = useCreateReleaseItemFeedback(releaseId, blockId);

  const [status, setStatus] = useState<ReleaseItemFeedbackStatus | null>(null);
  const [comment, setComment] = useState('');

  const history = data ?? [];
  const canSubmit = Boolean(status) && comment.trim().length > 0 && !createFeedback.isPending;

  const submit = () => {
    if (!status) return;
    const text = comment.trim();
    if (!text) return;
    createFeedback.mutate(
      { department, status, comment: text },
      { onSuccess: () => { setStatus(null); setComment(''); } },
    );
  };

  return (
    <Box sx={{ mt: '10px', pt: '10px', borderTop: `1px dashed ${T.ln}` }}>
      <Ey sx={{ mb: '6px' }}>
        {canonicalDepartmentLabel(department)} status &amp; comments
      </Ey>

      {isLoading ? (
        <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Loading…</Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', mb: '10px' }}>
          {history.map((entry) => {
            const meta = FEEDBACK_STATUS_META[entry.status];
            const author = resolveUser(entry.createdBy);
            return (
              <Box
                key={entry.id}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  border: `1px solid ${meta.line}`, background: meta.bg,
                  borderRadius: '8px', padding: '7px 10px',
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flex: '0 0 auto', mt: '4px' }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '2px' }}>
                    <Box sx={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>{meta.label}</Box>
                    <UserAvatar user={author} size={14} />
                    <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{author?.name ?? entry.createdBy}</Box>
                    <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(entry.createdAt)}</Box>
                  </Box>
                  <Box sx={{ fontSize: 11.5, color: T.tx, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {entry.comment}
                  </Box>
                </Box>
              </Box>
            );
          })}
          {!history.length && (
            <Box sx={{ fontSize: 11.5, color: T.dm2 }}>No status yet for this department.</Box>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: '6px', pt: '7px' }}>
          {(Object.keys(FEEDBACK_STATUS_META) as ReleaseItemFeedbackStatus[]).map((s) => {
            const meta = FEEDBACK_STATUS_META[s];
            const selected = status === s;
            return (
              <Box
                key={s}
                component="button"
                type="button"
                onClick={() => setStatus(s)}
                title={meta.label}
                sx={{
                  width: 18, height: 18, borderRadius: '50%', background: meta.color,
                  border: selected ? `2px solid ${T.tx}` : `1px solid ${meta.line}`,
                  boxShadow: selected ? `0 0 0 2px ${meta.bg}` : 'none',
                  cursor: 'pointer', padding: 0,
                }}
              />
            );
          })}
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <TextArea value={comment} onChange={setComment} rows={2} />
        </Box>
        <SirenButton variant="primary" disabled={!canSubmit} onClick={submit} sx={{ mt: '2px' }}>
          Add
        </SirenButton>
      </Box>
    </Box>
  );
}
