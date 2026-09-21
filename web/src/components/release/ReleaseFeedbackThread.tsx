import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { Ey, TextArea } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useCreateReleaseFeedback, useReleaseFeedback } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { ReleaseFeedbackDto, ReleaseFeedbackStatus } from '@/types/domain';
import { T } from '@/theme/tokens';

/**
 * release 한 건에 대해 한 부서가 남기는 댓글 스레드(설계서 09장 §4.2~4.3)의 공유 UI —
 * My Assignment의 `ReleaseDetailDialog`와 workflow list view의 부서별 대시보드
 * (05장 §7.1.1)가 이 파일 하나를 함께 쓴다. 두 화면의 유일한 차이는 **어떤 department로
 * 부르는지**와 **posting 가능한 사람이 누구인지**(서버가 매번 재검증한다)뿐이다.
 */

export const FEEDBACK_STATUS_META: Record<ReleaseFeedbackStatus, { label: string; color: string; bg: string; line: string }> = {
  accepted: { label: 'Fully accepted', color: T.ok, bg: T.okSoft, line: T.okLine },
  partial: { label: 'Partially accepted', color: T.warn, bg: T.warnSoft, line: T.warnLine },
  blocked: { label: 'Cannot accept yet', color: T.danger, bg: T.dangerSoft, line: T.dangerLine },
};
export const FEEDBACK_STATUSES = Object.keys(FEEDBACK_STATUS_META) as ReleaseFeedbackStatus[];

/** 상태 dot 하나. 지금 골라진 값이면 빨간 테두리/후광으로 확실히 티가 나게 한다(사용자
 * 확정) — dot 자체의 색(초록/노랑/빨강)과는 별개로, "선택됨" 표시는 항상 빨강이다. */
export function StatusDot({
  status, selected, onClick,
}: {
  status: ReleaseFeedbackStatus;
  selected: boolean;
  onClick?: () => void;
}) {
  const meta = FEEDBACK_STATUS_META[status];
  return (
    <Box
      component={onClick ? 'button' : 'div'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={meta.label}
      sx={{
        width: 16, height: 16, borderRadius: '50%', background: meta.color, flex: '0 0 auto',
        border: selected ? `2px solid ${T.danger}` : `1px solid ${meta.line}`,
        boxShadow: selected ? `0 0 0 2px ${T.dangerSoft}` : 'none',
        cursor: onClick ? 'pointer' : 'default', padding: 0,
      }}
    />
  );
}

/** 최상위 댓글 한 건 + 그 답글들. 답글에는 status가 없다(사용자 확정). */
export function FeedbackThread({
  entry, replies, resolveUser, replyOpen, replyText, onToggleReply, onReplyTextChange, onSubmitReply, submitting,
}: {
  entry: ReleaseFeedbackDto;
  replies: ReleaseFeedbackDto[];
  resolveUser: ReturnType<typeof useDirectory>['resolveUser'];
  replyOpen: boolean;
  replyText: string;
  onToggleReply: () => void;
  onReplyTextChange: (v: string) => void;
  onSubmitReply: () => void;
  submitting: boolean;
}) {
  const meta = FEEDBACK_STATUS_META[entry.status ?? 'accepted'];
  const author = resolveUser(entry.createdBy);

  return (
    <Box sx={{ border: `1px solid ${meta.line}`, background: meta.bg, borderRadius: '8px', padding: '8px 10px' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <StatusDot status={entry.status ?? 'accepted'} selected={false} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '2px' }}>
            <Box sx={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>{meta.label}</Box>
            <UserAvatar user={author} size={14} />
            <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{author?.name ?? entry.createdBy}</Box>
            <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: 'monospace' }}>{fmtAt(entry.createdAt)}</Box>
          </Box>
          <Box sx={{ fontSize: 11.5, color: T.tx, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {entry.comment}
          </Box>
        </Box>
      </Box>

      {replies.length > 0 && (
        <Box sx={{ mt: '8px', ml: '24px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: `2px solid ${T.ln}`, pl: '10px' }}>
          {replies.map((reply) => {
            const replyAuthor = resolveUser(reply.createdBy);
            return (
              <Box key={reply.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '2px' }}>
                  <UserAvatar user={replyAuthor} size={13} />
                  <Box sx={{ fontSize: 10.5, fontWeight: 600 }}>{replyAuthor?.name ?? reply.createdBy}</Box>
                  <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: 'monospace' }}>{fmtAt(reply.createdAt)}</Box>
                </Box>
                <Box sx={{ fontSize: 11, color: T.tx, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {reply.comment}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ mt: '6px', ml: '24px' }}>
        <SirenButton variant="ghost" onClick={onToggleReply}>
          {replyOpen ? 'Cancel' : 'Reply'}
        </SirenButton>
        {replyOpen && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px', mt: '6px' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <TextArea value={replyText} onChange={onReplyTextChange} rows={1} />
            </Box>
            <SirenButton variant="primary" disabled={!replyText.trim() || submitting} onClick={onSubmitReply}>
              Reply
            </SirenButton>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * release 한 건에 대해 그 부서가 남기는 댓글 스레드 전체(설계서 09장 §4.2~4.3) — 목록 +
 * 새로 쓰는 폼까지. **산출물마다가 아니라 release 전체에 하나뿐**이다(사용자 확정).
 *
 * ★ append-only다 — 새 항목을 추가할 뿐 기존 이력을 고치거나 지우지 않는다(Release 자체의
 *   철회 불가 원칙과 같다). "현재 상태"는 최상위 댓글 중 가장 최근 것으로 본다.
 * ★ status는 최상위 댓글에서 고르지 않으면 accepted(초록)가 기본이다(사용자 확정) — 그래서
 *   작성 폼은 처음부터 초록을 골라둔 채로 시작한다.
 * ★ `readOnly`가 있으면 작성 폼을 감춘다 — workflow 쪽 대시보드가 아직 posting UI를 열지
 *   않은 자리(예: 향후 읽기 전용 뷰)에서 재사용할 수 있게 열어 둔 옵션이다. 지금은 항상
 *   `false`로 쓰지만(My Assignment도, workflow 대시보드도 둘 다 답글을 달 수 있다), 서버가
 *   매 posting을 다시 검증하므로 이 플래그는 순수 UX 편의일 뿐이다.
 */
export function ReleaseFeedbackSection({
  releaseId, department, title, readOnly = false,
}: {
  releaseId: string;
  department: string;
  /** 헤더 문구 — 기본은 "{부서명} status & comments". 대시보드에서는 부서 카드 헤더를
   *  이미 그리므로 빈 문자열로 넘겨 생략할 수 있다. */
  title?: string;
  readOnly?: boolean;
}) {
  const { resolveUser } = useDirectory();
  const { data, isLoading } = useReleaseFeedback(releaseId, department);
  const createFeedback = useCreateReleaseFeedback(releaseId);

  const [status, setStatus] = useState<ReleaseFeedbackStatus>('accepted');
  const [comment, setComment] = useState('');
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const entries = useMemo(() => data ?? [], [data]);
  const topLevel = useMemo(() => entries.filter((e) => !e.parentId), [entries]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ReleaseFeedbackDto[]>();
    entries.filter((e) => e.parentId).forEach((e) => {
      const list = map.get(e.parentId as string) ?? [];
      list.push(e);
      map.set(e.parentId as string, list);
    });
    return map;
  }, [entries]);

  const submitTop = () => {
    const text = comment.trim();
    if (!text || createFeedback.isPending) return;
    createFeedback.mutate(
      { department, comment: text, status },
      { onSuccess: () => { setComment(''); setStatus('accepted'); } },
    );
  };

  const submitReply = (parentId: string) => {
    const text = replyText.trim();
    if (!text || createFeedback.isPending) return;
    createFeedback.mutate(
      { department, comment: text, parentId },
      { onSuccess: () => { setReplyText(''); setReplyOpenId(null); } },
    );
  };

  return (
    <Box>
      {title !== '' && (
        <Ey sx={{ mb: '7px' }}>
          {title ?? `${canonicalDepartmentLabel(department)} status & comments`}
        </Ey>
      )}

      {isLoading ? (
        <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Loading…</Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', mb: readOnly ? 0 : '12px' }}>
          {topLevel.map((entry) => (
            <FeedbackThread
              key={entry.id}
              entry={entry}
              replies={repliesByParent.get(entry.id) ?? []}
              resolveUser={resolveUser}
              replyOpen={replyOpenId === entry.id}
              replyText={replyOpenId === entry.id ? replyText : ''}
              onToggleReply={() => {
                setReplyOpenId(replyOpenId === entry.id ? null : entry.id);
                setReplyText('');
              }}
              onReplyTextChange={setReplyText}
              onSubmitReply={() => submitReply(entry.id)}
              submitting={createFeedback.isPending}
            />
          ))}
          {!topLevel.length && (
            <Box sx={{ fontSize: 11.5, color: T.dm2 }}>No comments yet for this department.</Box>
          )}
        </Box>
      )}

      {!readOnly && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: '6px', pt: '7px' }}>
            {FEEDBACK_STATUSES.map((s) => (
              <StatusDot key={s} status={s} selected={status === s} onClick={() => setStatus(s)} />
            ))}
          </Box>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <TextArea value={comment} onChange={setComment} rows={2} />
          </Box>
          <SirenButton variant="primary" disabled={!comment.trim() || createFeedback.isPending} onClick={submitTop} sx={{ mt: '2px' }}>
            Add
          </SirenButton>
        </Box>
      )}
    </Box>
  );
}
