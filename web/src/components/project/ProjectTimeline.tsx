import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { DeliverableDto, Milestone, ScheduleSpan, WorkflowDto } from '@/types/domain';
import { useDeliverables } from '@/api/hooks/useDeliverables';
import {
  DAY_MS, DateRange, dayMs, monthTicks, rangeOf, ratioIn, shortDate, sortSchedule, spanDays,
} from '@/lib/schedule';
import { domainOf, UNASSIGNED_DOMAIN } from '@/lib/domainWorkflow';
import { Icon } from '@/components/common/Icon';
import { FONT_MONO, T } from '@/theme/tokens';

const LABEL_W = 208;
/** 하루당 가로 픽셀. 1년 과제가 대략 900px 정도로 잡히도록. */
const PX_PER_DAY = 2.4;
const MIN_TRACK_W = 760;
const BAR_H = 22;
const BAR_GAP = 5;
const ROW_PAD = 9;

const LEGEND = [
  { key: 'released', label: 'Released', c: T.tl },
  { key: 'progress', label: 'In progress', c: T.am },
  { key: 'pending', label: 'Not submitted', c: T.dm2 },
] as const;

function statusCounts(deliverables: DeliverableDto[]) {
  let notSubmitted = 0;
  let inProgress = 0;
  let released = 0;
  deliverables.forEach((d) => {
    if (!d.versions.length) notSubmitted++;
    else if (d.workingVersion) inProgress++;
    else released++;
  });
  return { notSubmitted, inProgress, released, total: deliverables.length };
}

/**
 * 겹치는 구간을 위아래로 쌓기 위한 그리디 레인 배정 — 이미 놓인 줄 중 끝난 것이 있으면
 * 그 줄을 재사용하고, 없으면 새 줄을 만든다. 입력은 시작일 오름차순이어야 한다.
 */
function packLanes<T extends ScheduleSpan>(spans: T[]): { span: T; lane: number }[] {
  const laneEnd: number[] = [];
  return spans.map((span) => {
    const start = dayMs(span.start);
    let lane = laneEnd.findIndex((end) => end <= start);
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
    laneEnd[lane] = dayMs(span.end) + DAY_MS;
    return { span, lane };
  });
}

interface Geometry { range: DateRange; trackW: number }

function xOf(g: Geometry, iso: string) { return ratioIn(g.range, dayMs(iso)) * g.trackW; }

/**
 * 과제 타임라인 — x축이 실제 날짜다.
 *
 * 위쪽 띠는 과제 공통 마일스톤, 그 아래는 workflow마다 자기 phase 막대다. 둘을 같은
 * 날짜축 위에 겹쳐 놓는 것이 이 화면의 목적이다: workflow별 일정이 과제 일정과 어디서
 * 어긋나는지가 한눈에 보여야 한다(예전의 "마일스톤 × IP 표"로는 알 수 없던 것).
 *
 * 축 범위는 마일스톤과 모든 workflow phase를 다 덮는다 — 마일스톤 밖으로 나간 일정이
 * 화면에서 잘려 사라지면 안 되기 때문이다.
 */
export function ProjectTimeline({
  projectId, milestones, workflows, mineOnly = false, myKnoxId,
}: {
  projectId: string; milestones: Milestone[]; workflows: WorkflowDto[];
  /** My Task 필터 (Hub 설계서 §14.3) — 내가 owner인 workflow만 남긴다. */
  mineOnly?: boolean;
  myKnoxId?: string;
}) {
  const sortedMilestones = useMemo(() => sortSchedule(milestones), [milestones]);

  /**
   * 목록이 길어지면 자기 것만 보고 싶어진다 (§14.3). 기준은 owner(=Edit 권한자)이며,
   * 축 범위는 필터와 무관하게 전체 일정을 덮는다 — 필터를 켰다고 날짜축이 널뛰면
   * 같은 화면을 보고 있다는 감각이 깨진다.
   */
  const shown = useMemo(
    () => (mineOnly && myKnoxId ? workflows.filter((w) => (w.owners ?? []).includes(myKnoxId)) : workflows),
    [workflows, mineOnly, myKnoxId],
  );

  const geo = useMemo<Geometry | null>(() => {
    const range = rangeOf(milestones, ...workflows.map((w) => w.phases ?? []));
    if (!range) return null;
    const days = Math.max(1, Math.round((range.endMs - range.startMs) / DAY_MS));
    return { range, trackW: Math.max(MIN_TRACK_W, Math.round(days * PX_PER_DAY)) };
  }, [milestones, workflows]);

  /** 도메인 단위로 묶어서 보여 준다 — 3D 뷰와 같은 그룹 기준. */
  const groups = useMemo(() => {
    const m = new Map<string, WorkflowDto[]>();
    shown.forEach((w) => {
      const key = domainOf(w);
      const arr = m.get(key) ?? [];
      arr.push(w);
      m.set(key, arr);
    });
    return [...m.entries()]
      .sort((a, b) => (a[0] === UNASSIGNED_DOMAIN ? 1 : b[0] === UNASSIGNED_DOMAIN ? -1 : a[0].localeCompare(b[0])))
      .map(([key, items]) => ({ key, workflows: [...items].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [shown]);

  if (!geo) {
    return (
      <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '12px', background: T.sf, padding: '28px', textAlign: 'center', fontSize: 12.5, color: T.dm2 }}>
        No schedule yet — add milestones to start the timeline.
      </Box>
    );
  }

  const nowMs = Date.now();
  const todayX = nowMs >= geo.range.startMs && nowMs <= geo.range.endMs
    ? ratioIn(geo.range, nowMs) * geo.trackW
    : null;
  const milestoneLanes = packLanes(sortedMilestones);
  const milestoneRows = Math.max(1, ...milestoneLanes.map((l) => l.lane + 1));

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: '14px', mb: '11px', flexWrap: 'wrap' }}>
        {LEGEND.map((l) => (
          <Box key={l.key} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 11, color: T.dm }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '3px', background: l.c }} />
            {l.label}
          </Box>
        ))}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 11, color: T.rd }}>
          <Icon name="warn" size={11} /> No release schedule
        </Box>
      </Box>

      <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '12px', background: T.sf, overflow: 'hidden', boxShadow: T.ss }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: LABEL_W + geo.trackW, position: 'relative' }}>
            {/* ── 날짜 눈금 ── */}
            <Box sx={{ display: 'flex', borderBottom: `1px solid ${T.ln}`, background: T.sf2 }}>
              <Box
                sx={{
                  flex: `0 0 ${LABEL_W}px`, position: 'sticky', left: 0, zIndex: 3, background: T.sf2,
                  borderRight: `1px solid ${T.ln}`, padding: '9px 14px',
                  fontSize: 10, fontFamily: FONT_MONO, letterSpacing: '.08em', color: T.dm2,
                  display: 'flex', alignItems: 'flex-end',
                }}
              >
                WORKFLOW \ DATE
              </Box>
              <Box sx={{ position: 'relative', flex: `0 0 ${geo.trackW}px`, height: 34 }}>
                {monthTicks(geo.range).map((t) => (
                  <Box
                    key={t.ms}
                    style={{ left: ratioIn(geo.range, t.ms) * geo.trackW }}
                    sx={{ position: 'absolute', top: 0, bottom: 0, borderLeft: `1px solid ${T.ln}` }}
                  >
                    <Box sx={{ position: 'absolute', bottom: 5, left: 5, fontFamily: FONT_MONO, fontSize: 9.5, color: T.dm2, whiteSpace: 'nowrap' }}>
                      {t.label}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* ── 과제 마일스톤 띠 ── */}
            <Box sx={{ display: 'flex', borderBottom: `2px solid ${T.ln2}`, background: T.sf2 }}>
              <Box
                sx={{
                  flex: `0 0 ${LABEL_W}px`, position: 'sticky', left: 0, zIndex: 3, background: T.sf2,
                  borderRight: `1px solid ${T.ln}`, padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: '7px',
                  fontSize: 12, fontWeight: 700, color: T.tx,
                }}
              >
                <Icon name="flag" size={12} /> Project milestones
              </Box>
              <Box
                style={{ height: milestoneRows * (BAR_H + BAR_GAP) + ROW_PAD * 2 - BAR_GAP }}
                sx={{ position: 'relative', flex: `0 0 ${geo.trackW}px` }}
              >
                {milestoneLanes.map(({ span, lane }) => {
                  const left = xOf(geo, span.start);
                  const width = Math.max(3, xOf(geo, span.end) + (DAY_MS / (geo.range.endMs - geo.range.startMs)) * geo.trackW - left);
                  return (
                    <Box
                      key={span.id}
                      title={`${span.name} · ${shortDate(span.start)} → ${shortDate(span.end)} · ${spanDays(span)}d`}
                      style={{ left, width, top: ROW_PAD + lane * (BAR_H + BAR_GAP) }}
                      sx={{
                        position: 'absolute', height: BAR_H, borderRadius: '6px',
                        background: T.tl2, border: `1px solid ${T.tl3}`,
                        display: 'flex', alignItems: 'center', padding: '0 8px',
                        fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 700, color: T.tl,
                        overflow: 'hidden', whiteSpace: 'nowrap',
                      }}
                    >
                      {span.name}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* ── 도메인 → workflow 행 ── */}
            {groups.map((g) => (
              <Box key={g.key}>
                <Box sx={{ display: 'flex', background: T.sf3, borderBottom: `1px solid ${T.ln}` }}>
                  <Box
                    sx={{
                      flex: `0 0 ${LABEL_W}px`, position: 'sticky', left: 0, zIndex: 3, background: T.sf3,
                      borderRight: `1px solid ${T.ln}`, padding: '6px 14px',
                      fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em', color: T.dm,
                    }}
                  >
                    {g.key === UNASSIGNED_DOMAIN ? 'UNASSIGNED' : g.key.toUpperCase()}
                  </Box>
                  <Box sx={{ flex: `0 0 ${geo.trackW}px` }} />
                </Box>
                {g.workflows.map((w) => (
                  <WorkflowTimelineRow key={w.id} projectId={projectId} workflow={w} geo={geo} />
                ))}
              </Box>
            ))}

            {!workflows.length && (
              <Box sx={{ padding: '24px', fontSize: 12.5, color: T.dm2, textAlign: 'center' }}>
                No viewable workflows under this project.
              </Box>
            )}

            {/* ── TODAY 세로선 — 헤더부터 맨 아래까지 한 줄로 지난다. ── */}
            {todayX !== null && (
              <Box
                style={{ left: LABEL_W + todayX }}
                sx={{
                  position: 'absolute', top: 0, bottom: 0, width: '1.5px',
                  background: T.rd, opacity: 0.6, pointerEvents: 'none', zIndex: 2,
                }}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * workflow 한 줄 — 자기 phase 막대를 날짜축 위에 깔고, 막대 안에 그 phase 산출물의
 * released/in-progress 비율을 얇은 띠로 채운다. 일정을 잃은 산출물은 어느 막대에도
 * 속하지 않으므로 행 오른쪽 끝에 따로 세어서 붙인다.
 */
function WorkflowTimelineRow({
  projectId, workflow, geo,
}: {
  projectId: string; workflow: WorkflowDto; geo: Geometry;
}) {
  const { data: deliverablesResp } = useDeliverables(workflow.id);
  const deliverables = deliverablesResp?.data;

  const byPhase = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    (deliverables ?? []).forEach((d) => {
      const arr = m.get(d.phaseId) ?? [];
      arr.push(d);
      m.set(d.phaseId, arr);
    });
    return m;
  }, [deliverables]);

  const phases = useMemo(() => sortSchedule(workflow.phases ?? []), [workflow.phases]);
  const phaseIds = useMemo(() => new Set(phases.map((p) => p.id)), [phases]);
  const orphans = useMemo(
    () => (deliverables ?? []).filter((d) => !phaseIds.has(d.phaseId)),
    [deliverables, phaseIds],
  );

  const lanes = packLanes(phases);
  const rows = Math.max(1, ...lanes.map((l) => l.lane + 1));
  const height = rows * (BAR_H + BAR_GAP) + ROW_PAD * 2 - BAR_GAP;

  return (
    <Box sx={{ display: 'flex', borderBottom: `1px solid ${T.ln}` }}>
      <Box
        component={Link}
        to={`/details/${projectId}/${workflow.id}`}
        sx={{
          flex: `0 0 ${LABEL_W}px`, position: 'sticky', left: 0, zIndex: 3, background: T.sf,
          borderRight: `1px solid ${T.ln}`, borderLeft: `3px solid ${workflow.color || T.tl}`,
          padding: '10px 12px', textDecoration: 'none', color: 'inherit',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0,
          '&:hover': { background: T.sf2 },
        }}
      >
        <Box sx={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workflow.name}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {phases.length} phase{phases.length === 1 ? '' : 's'}
          {orphans.length > 0 && (
            <Box component="span" sx={{ color: T.rd, ml: '6px' }}>· {orphans.length} unscheduled</Box>
          )}
        </Box>
      </Box>

      <Box style={{ height }} sx={{ position: 'relative', flex: `0 0 ${geo.trackW}px` }}>
        {lanes.map(({ span, lane }) => {
          const items = byPhase.get(span.id) ?? [];
          const c = statusCounts(items);
          const left = xOf(geo, span.start);
          const width = Math.max(
            4,
            xOf(geo, span.end) + (DAY_MS / (geo.range.endMs - geo.range.startMs)) * geo.trackW - left,
          );
          const pct = (n: number) => (c.total ? (n / c.total) * 100 : 0);
          const title = items.length
            ? items
                .map((d) => `${d.name} — ${!d.versions.length ? 'Not submitted' : d.workingVersion ? 'In progress' : 'Released'}`)
                .join('\n')
            : 'No artifacts in this phase';

          return (
            <Box
              key={span.id}
              title={`${span.name} · ${shortDate(span.start)} → ${shortDate(span.end)}\n${title}`}
              style={{ left, width, top: ROW_PAD + lane * (BAR_H + BAR_GAP) }}
              sx={{
                position: 'absolute', height: BAR_H, borderRadius: '6px', overflow: 'hidden',
                background: T.sf2, border: `1px solid ${T.ln2}`,
              }}
            >
              {/* 상태 비율 — 막대 배경을 그대로 채운다(별도 미니 바를 겹치지 않는다). */}
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex' }}>
                <Box sx={{ width: `${pct(c.released)}%`, background: T.tl2 }} />
                <Box sx={{ width: `${pct(c.inProgress)}%`, background: T.am2 }} />
              </Box>
              <Box
                sx={{
                  position: 'relative', height: '100%', display: 'flex', alignItems: 'center',
                  gap: '6px', padding: '0 7px', whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, color: T.tx }}>{span.name}</Box>
                {c.total > 0 && (
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: T.dm }}>
                    {c.released}/{c.total}
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}

        {!phases.length && (
          <Box sx={{ position: 'absolute', left: 10, top: ROW_PAD + 3, fontSize: 11, color: T.dm2 }}>
            No schedule set for this workflow yet.
          </Box>
        )}

        {/* 일정을 잃은 산출물 — 날짜축 위에 놓을 자리가 없으므로 행 왼쪽 끝에 배지로 남긴다. */}
        {orphans.length > 0 && (
          <Box
            title={orphans.map((d) => d.name).join('\n')}
            style={{ top: ROW_PAD }}
            sx={{
              position: 'absolute', right: 8, height: BAR_H, display: 'inline-flex', alignItems: 'center',
              gap: '5px', padding: '0 8px', borderRadius: '6px',
              background: T.rd2, border: `1px dashed ${T.rd3}`, color: T.rd,
              fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <Icon name="warn" size={11} /> {orphans.length} unscheduled
          </Box>
        )}
      </Box>
    </Box>
  );
}
