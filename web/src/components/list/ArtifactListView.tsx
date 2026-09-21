import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Card, Ey } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { FEEDBACK_STATUS_META, ReleaseFeedbackSection, StatusDot } from '@/components/release/ReleaseFeedbackThread';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useComments } from '@/api/hooks/useComments';
import { useAllReleaseFeedback } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { useDepartmentLabel } from '@/hooks/useDepartmentLabel';
import { NodeDto, NetworkKind, ReleaseDto, ReleaseFeedbackStatus, ReleasePreviewItemDto, WorkflowDto } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, R, T, TNUM } from '@/theme/tokens';

type OpenTab = 'overview' | 'recipients' | 'comments';

interface ListRow {
  nodeId: string;
  name: string;
  network: NetworkKind;
  phaseName: string;
  intent: 'own' | 'received';
  publishedLabel: string | null;
  publishedAt: string | null;
  /** 직전 release 대비 published version이 바뀌었는가 — 이 행을 강조하는 데만 쓴다. */
  changed: boolean;
  masked: boolean;
  recipientDepartments: string[];
}

interface Props {
  workflow: WorkflowDto;
  nodes: NodeDto[];
  sortedReleases: ReleaseDto[];
  selected: ReleaseDto | null;
  showCurrent: boolean;
  canShowCurrent: boolean;
  previewItems: ReleasePreviewItemDto[];
  previewChangedCount: number;
  recipientFilter: string[];
  canEdit: boolean;
  workflowId: string;
  onSelectRelease: (id: string) => void;
  onSelectCurrent: () => void;
  onOpenArtifact: (nodeId: string, tab?: OpenTab) => void;
  onAddArtifact: () => void;
}

/**
 * workflow 진입 시 "메인" 화면(사용자 요청) — 예전 Release 이력 페이지를 대체한다.
 * 좌측은 그대로 release 이력 목록이고, 우측이 완전히 새로 짜였다: OA/HPC 대신
 * "내가 줘야 하는 산출물(Deliverable)"과 "내가 받아야 하는 산출물(Prerequisite)"로 나누고,
 * 컬럼도 Artifact / Phase / Published Version / Updated / Comments로 바꿨다.
 *
 * ★ "Current"(showCurrent)는 매핑된 산출물(previewItems, 서버가 실시간으로 계산)뿐 아니라
 *   아직 artifact를 안 매핑한 node도 함께 나열한다 — "지금 node로 설정된 것들을 전부
 *   보여 달라"는 요청 그대로다. 반면 과거 release를 고르면 그 release가 실제로 실었던
 *   항목(이미 artifact가 매핑돼 있던 것들)만 그 스냅샷 그대로 보여준다 — 이력이니 당연하다.
 * ★ own/received 구분은 node에 생성 시 확정되는 intent를 쓴다. 과거 release 항목은
 *   frozen snapshot이라 intent가 없어서, 지금 이 workflow에 남아 있는 node와 nodeId로
 *   조인해서 구한다 — 그 node가 그 사이 지워졌으면(드묾) own으로 취급한다.
 */
export function ArtifactListView({
  workflow, nodes, sortedReleases, selected, showCurrent, canShowCurrent,
  previewItems, previewChangedCount, recipientFilter, canEdit, workflowId,
  onSelectRelease, onSelectCurrent, onOpenArtifact, onAddArtifact,
}: Props) {
  const { resolveUser } = useDirectory();
  const { label: deptLabel } = useDepartmentLabel(workflow.projectId);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const phaseNameById = useMemo(
    () => new Map(workflow.phases.map((p) => [p.id, p.name])),
    [workflow.phases],
  );

  const rows: ListRow[] = useMemo(() => {
    if (showCurrent) {
      const mappedIds = new Set(previewItems.map((i) => i.nodeId));
      const fromItems: ListRow[] = previewItems.map((item) => ({
        nodeId: item.nodeId,
        name: item.artifactName,
        network: item.network,
        phaseName: item.phaseName,
        intent: nodeById.get(item.nodeId)?.intent ?? 'own',
        publishedLabel: item.published?.versionLabel ?? null,
        publishedAt: item.published?.publishedAt ?? null,
        changed: item.changed,
        masked: false,
        recipientDepartments: item.recipients.departments,
      }));
      const fromUnmapped: ListRow[] = nodes
        .filter((n) => !mappedIds.has(n.id))
        .map((n) => ({
          nodeId: n.id,
          name: n.name,
          network: null,
          phaseName: phaseNameById.get(n.phaseId) ?? '—',
          intent: n.intent,
          publishedLabel: null,
          publishedAt: null,
          changed: false,
          masked: false,
          recipientDepartments: n.recipients?.departments ?? [],
        }));
      return [...fromItems, ...fromUnmapped];
    }
    if (!selected) return [];
    return selected.items.map((item) => ({
      nodeId: item.nodeId,
      name: item.artifactName,
      network: item.network,
      phaseName: item.phaseName,
      intent: nodeById.get(item.nodeId)?.intent ?? 'own',
      publishedLabel: item.published?.versionLabel ?? null,
      publishedAt: item.published?.publishedAt ?? null,
      changed: item.changed,
      masked: item.masked,
      recipientDepartments: item.recipients.departments,
    }));
  }, [showCurrent, previewItems, nodes, nodeById, phaseNameById, selected]);

  const filtered = useMemo(
    () => rows.filter(
      (r) => !recipientFilter.length || r.recipientDepartments.some((d) => recipientFilter.includes(d)),
    ),
    [rows, recipientFilter],
  );

  const ownRows = useMemo(
    () => filtered.filter((r) => r.intent === 'own').sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );
  const receivedRows = useMemo(
    () => filtered.filter((r) => r.intent === 'received').sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  if (sortedReleases.length === 0 && !showCurrent) {
    return (
      <Box sx={{ flex: 1, padding: '44px 16px', textAlign: 'center', color: T.dm2, fontSize: 13 }}>
        No release yet.
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: '18px', flex: 1, minHeight: 0, padding: '20px 24px', overflow: 'hidden' }}>
      {/* 좌측 — release 목록 (Current는 실제 edit 권한자에게만, 맨 위에 고정) */}
      <Box
        sx={{
          width: 240, flexShrink: 0, overflowY: 'auto',
          borderRight: `1px solid ${T.ln}`, paddingRight: '14px',
        }}
      >
        {canShowCurrent && (
          <Box
            component="button"
            onClick={onSelectCurrent}
            sx={{
              display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
              background: showCurrent ? T.prSoft : T.sf2,
              border: `1px solid ${showCurrent ? T.prLine : T.ln}`,
              borderRadius: `${R.sm}px`, padding: '9px 10px', mb: '10px', cursor: CURSOR_POINTER,
              '&:hover': { background: showCurrent ? T.prSoft : T.sf3 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
              <Box sx={{ fontSize: 13, fontWeight: 700, color: showCurrent ? T.pr : T.tx }}>Current</Box>
            </Box>
            <Box sx={{ fontSize: 11, color: T.dm, mt: '3px' }}>
              Live state since {sortedReleases[0]?.label ?? 'the start'}
              {previewChangedCount > 0 && (
                <Box component="span" sx={{ color: T.warn }}> · {previewChangedCount} changed</Box>
              )}
            </Box>
          </Box>
        )}
        {sortedReleases.map((r) => {
          const on = r.id === selected?.id;
          const changedCount = r.items.filter((i) => i.changed).length;
          return (
            <Box
              key={r.id}
              component="button"
              onClick={() => onSelectRelease(r.id)}
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
                <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.note}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* 우측 — 선택된 release(또는 Current)의 artifact 표 */}
      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: '12px' }}>
          {/* Current를 볼 때만 노출된다(사용자 확정, 설계서 05장 §7.1) — 과거 release는
              그 시점의 스냅샷이라 여기서 새 node를 만드는 게 의미가 없다. */}
          {canEdit && showCurrent && (
            <SirenButton variant="primary" onClick={onAddArtifact}>
              <Icon name="plus" /> Add New Node
            </SirenButton>
          )}
        </Box>

        {!showCurrent && selected && (
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
            </Box>

            {selected.note && (
              <Box
                sx={{
                  fontSize: 12.5, color: T.tx2, lineHeight: 1.6, background: T.sf2,
                  border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, padding: '9px 11px', mb: '16px',
                }}
              >
                {selected.note}
              </Box>
            )}

            {/* 부서별 status/comment 대시보드(설계서 05장 §7.1.1) — Comments 컬럼과 같은
                기준으로 workflow Edit Access에게만 보인다. 캔버스/list view가 공유하는
                recipientFilter가 비어 있으면(전체 부서) 요약을, 부서로 좁혔으면 그 부서(들)의
                스레드 전체를 보여준다. */}
            {canEdit && (
              <ReleaseFeedbackDashboard
                releaseId={selected.id}
                projectId={workflow.projectId}
                recipientDepartments={selected.recipientDepartments}
                recipientFilter={recipientFilter}
                deptLabel={deptLabel}
              />
            )}
          </>
        )}

        {(showCurrent || selected) && (
          <>
            <ArtifactGroup title="Deliverable" rows={ownRows} workflowId={workflowId} canEdit={canEdit} onOpen={onOpenArtifact} deptLabel={deptLabel} />
            <Box sx={{ height: '18px' }} />
            <ArtifactGroup title="Prerequisite" rows={receivedRows} workflowId={workflowId} canEdit={canEdit} onOpen={onOpenArtifact} deptLabel={deptLabel} />
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * 부서별 release status/comment 대시보드(설계서 05장 §7.1.1) — 09장 §4의 assumption
 * A4를 완성한다: "workflow(낸 쪽)이 여러 부서의 상태를 한눈에 모아보는 화면"이 이제
 * workflow의 list view 안, 과거 release를 열었을 때 산출물 표 위에 얹힌다.
 *
 * 필터 없음(전체 부서) → 부서마다 요약 카드 하나(최신 status + 댓글 수)만, 한 번에
 * 부르는 `GET .../feedback/all`로. 부서 1개 이상으로 좁혔을 때 → 그 부서(들)의 스레드
 * 전체(답글·작성 폼 포함)를 `ReleaseFeedbackSection`으로 — My Assignment와 같은
 * 컴포넌트를 재사용하므로 여기서 다는 답글도 완전히 동작한다.
 */
function ReleaseFeedbackDashboard({
  releaseId, projectId, recipientDepartments, recipientFilter, deptLabel,
}: {
  releaseId: string;
  projectId: string;
  recipientDepartments: string[];
  recipientFilter: string[];
  deptLabel: (deptId: string) => string;
}) {
  if (!recipientDepartments.length) return null;

  if (recipientFilter.length > 0) {
    const filtered = recipientDepartments.filter((d) => recipientFilter.includes(d));
    if (!filtered.length) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px', mb: '18px' }}>
        {filtered.map((dept) => (
          <Box key={dept} sx={{ border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, padding: '12px 14px', background: T.sf2 }}>
            <ReleaseFeedbackSection releaseId={releaseId} department={dept} projectId={projectId} />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <ReleaseFeedbackSummary
      releaseId={releaseId}
      recipientDepartments={recipientDepartments}
      deptLabel={deptLabel}
    />
  );
}

/** "전체 부서" 요약 — 부서마다 최신 top-level status + 댓글 수만 카드로. */
function ReleaseFeedbackSummary({
  releaseId, recipientDepartments, deptLabel,
}: {
  releaseId: string;
  recipientDepartments: string[];
  deptLabel: (deptId: string) => string;
}) {
  const { data, isLoading } = useAllReleaseFeedback(releaseId, true);

  return (
    <Box sx={{ mb: '18px' }}>
      <Ey sx={{ mb: '9px' }}>Department status &amp; comments — all recipients</Ey>
      {isLoading ? (
        <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Loading…</Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
          {recipientDepartments.map((dept) => {
            const entries = data?.[dept] ?? [];
            const topLevel = entries.filter((e) => !e.parentId);
            const latestStatus: ReleaseFeedbackStatus = topLevel.length
              ? (topLevel[topLevel.length - 1].status ?? 'accepted')
              : 'accepted';
            const meta = FEEDBACK_STATUS_META[latestStatus];
            return (
              <Box
                key={dept}
                sx={{
                  border: `1px solid ${meta.line}`, background: meta.bg, borderRadius: `${R.sm}px`,
                  padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <StatusDot status={latestStatus} selected={false} />
                  <Box sx={{ fontSize: 12.5, fontWeight: 700 }}>{deptLabel(dept)}</Box>
                </Box>
                <Box sx={{ fontSize: 11, color: T.dm2 }}>
                  {entries.length === 0
                    ? 'No comments yet'
                    : `${entries.length} comment${entries.length > 1 ? 's' : ''} · ${meta.label}`}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function ArtifactGroup({
  title, rows, workflowId, canEdit, onOpen, deptLabel,
}: {
  title: string;
  rows: ListRow[];
  workflowId: string;
  canEdit: boolean;
  onOpen: (nodeId: string, tab?: OpenTab) => void;
  deptLabel: (deptId: string) => string;
}) {
  return (
    <Card>
      <Ey sx={{ mb: '10px' }}>{title} ({rows.length})</Ey>
      {rows.length === 0 ? (
        <Box sx={{ padding: '14px 4px', color: T.dm2, fontSize: 12.5 }}>No artifacts.</Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex', gap: '10px', padding: '4px 8px', fontSize: 10.5, fontWeight: 700,
              color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em',
            }}
          >
            <Box sx={{ flex: '2 1 0', minWidth: 0 }}>Artifact</Box>
            <Box sx={{ width: 110, flexShrink: 0 }}>Phase</Box>
            <Box sx={{ width: 150, flexShrink: 0 }}>Recipient</Box>
            <Box sx={{ width: 100, flexShrink: 0 }}>Published Version</Box>
            <Box sx={{ width: 130, flexShrink: 0 }}>Updated</Box>
            <Box sx={{ flex: '2 1 0', minWidth: 0 }}>Comments</Box>
          </Box>
          {rows.map((row) => (
            <ListArtifactRow key={row.nodeId} row={row} workflowId={workflowId} canEdit={canEdit} onOpen={onOpen} deptLabel={deptLabel} />
          ))}
        </Box>
      )}
    </Card>
  );
}

function ListArtifactRow({
  row, workflowId, canEdit, onOpen, deptLabel,
}: {
  row: ListRow;
  workflowId: string;
  canEdit: boolean;
  onOpen: (nodeId: string, tab?: OpenTab) => void;
  deptLabel: (deptId: string) => string;
}) {
  return (
    <Box
      onClick={() => onOpen(row.nodeId)}
      sx={{
        display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 8px',
        // 직전 release 대비 published version이 바뀐 행은 배경색으로 눈에 띄게(사용자
        // 요청) — 예전 release 표(HistoryRow)와 같은 표기(T.changed/T.changedLine).
        background: row.changed ? T.changed : 'transparent',
        borderTop: `1px solid ${row.changed ? T.changedLine : T.ln}`,
        cursor: CURSOR_POINTER,
        '&:hover': { background: row.changed ? T.changed : T.sf2 },
      }}
    >
      <Box sx={{ flex: '2 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
        {row.masked ? (
          <Box sx={{ color: T.dm2, display: 'inline-flex', flexShrink: 0 }} title="No access">
            <Icon name="lock" size={12} />
          </Box>
        ) : (
          // 오늘은 OA/HPC 칩 하나뿐이지만, 이 자리는 앞으로 다른 chip이 더 붙을 수 있게
          // flex row로 비워 둔다(사용자 요청).
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <NetworkTag network={row.network} />
          </Box>
        )}
        <Box
          sx={{
            fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', color: row.masked ? T.dm2 : T.tx,
          }}
        >
          {row.name}
        </Box>
      </Box>

      <Box sx={{ width: 110, flexShrink: 0, fontSize: 12, color: T.dm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.phaseName}
      </Box>

      {/* 부서만 보여준다 — 일반 user recipient는 여기 표시하지 않는다(사용자 요청).
          아무 부서도 없으면 그냥 비워둔다. */}
      <Box sx={{ width: 150, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
        {row.recipientDepartments.slice(0, 2).map((d) => (
          <Box
            key={d}
            sx={{
              fontSize: 10.5, color: T.dm, background: T.sf3, borderRadius: `${R.pill}px`,
              padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 90,
            }}
          >
            {deptLabel(d)}
          </Box>
        ))}
        {row.recipientDepartments.length > 2 && (
          <Box sx={{ fontSize: 10.5, color: T.dm2, flexShrink: 0 }}>+{row.recipientDepartments.length - 2}</Box>
        )}
      </Box>

      <Box sx={{ width: 100, flexShrink: 0, fontFamily: FONT_MONO, fontSize: 12, ...TNUM }}>
        {row.publishedLabel ?? '—'}
      </Box>

      <Box sx={{ width: 130, flexShrink: 0, fontSize: 11.5, color: T.dm2, ...TNUM }}>
        {row.publishedAt ? fmtAt(row.publishedAt) : '—'}
      </Box>

      <Box sx={{ flex: '2 1 0', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
        {/* Comments는 이 workflow의 Edit Access가 있을 때만 열린다(설계서 01장 §3.8
            확장) — canEdit이 아니면 API 자체가 403이라 아예 물어보지 않는다. */}
        {!row.masked && canEdit && (
          <LatestCommentCell workflowId={workflowId} nodeId={row.nodeId} onOpen={() => onOpen(row.nodeId, 'comments')} />
        )}
      </Box>
    </Box>
  );
}

function LatestCommentCell({ workflowId, nodeId, onOpen }: { workflowId: string; nodeId: string; onOpen: () => void }) {
  const comments = useComments(workflowId, nodeId);
  const latest = comments.data && comments.data.length > 0 ? comments.data[comments.data.length - 1] : undefined;

  return (
    <Box
      onClick={onOpen}
      title={latest?.text}
      sx={{
        cursor: CURSOR_POINTER, fontSize: 12, color: latest ? T.tx2 : T.dm2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {latest ? latest.text : 'No comments yet.'}
    </Box>
  );
}
