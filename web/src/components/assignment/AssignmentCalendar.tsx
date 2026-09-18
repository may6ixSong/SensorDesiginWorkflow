import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { Badge } from '@/components/common/SirenButton';
import { ModalShell } from '@/components/common/ModalShell';
import { Ey } from '@/components/common/Panel';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { useMyCalendar } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyReleaseRowDto, VersionEventDto } from '@/types/domain';
import { CURSOR_POINTER, FONT_DISPLAY, FONT_MONO, T, TIER_LABEL } from '@/theme/tokens';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 로컬 기준 'YYYY-MM-DD' — 격자의 칸을 고르는 키다. UTC로 만들면 하루가 밀린다. */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 그 달을 감싸는 격자의 범위 — 앞뒤로 주 단위를 채운 첫 칸부터 마지막 칸 **다음 순간**까지.
 * 서버에 보내는 from/to가 곧 이 값이라, 화면에 그려지는 칸과 조회 범위가 정확히 일치한다.
 */
function gridRange(year: number, month: number): { start: Date; end: Date; days: Date[] } {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const days: Date[] = [];
  const cursor = new Date(start);
  // 6주 격자를 항상 그린다 — 달마다 높이가 출렁이면 앞뒤로 넘길 때 시선이 흔들린다.
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { start, end: new Date(cursor), days };
}

type DayEvent =
  | { kind: 'version'; at: string; data: VersionEventDto }
  | { kind: 'release'; at: string; data: MyReleaseRowDto };

/**
 * 날짜별 event 달력 (설계서 09장 §5).
 *
 * 두 종류가 **색으로 갈린다**:
 *   - artifact 버전 발행(A/B/C 전부) — primary 계열. 내 부서 workflow가 주는 산출물로
 *     만든 block에 매핑된 artifact의 버전만이다. Tier A/C는 실제 편집 권한을 그 서비스가
 *     들고 있어 SIREN이 알 수 없으므로, 그 기준을 이걸로 대신한다(사용자 확정).
 *   - workflow release — recv 계열. 내 부서가 냈거나 내가/내 부서가 받은 것만이다.
 *
 * ★ 한 달치 event만 읽는다 — 서버가 범위 밖을 아예 싣지 않고, 달을 옮길 때마다 그 달만
 *   다시 부른다(이미 본 달은 캐시에 남는다).
 */
export function AssignmentCalendar({ onOpenRelease }: { onOpenRelease: (row: MyReleaseRowDto) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [openDay, setOpenDay] = useState<string | null>(null);

  const { start, end, days } = useMemo(() => gridRange(cursor.year, cursor.month), [cursor]);
  const { data, isLoading, isError, isPlaceholderData } = useMyCalendar(
    start.toISOString(),
    end.toISOString(),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const push = (e: DayEvent) => {
      const key = dayKey(new Date(e.at));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    };
    for (const v of data?.versionEvents ?? []) push({ kind: 'version', at: v.occurredAt, data: v });
    for (const r of data?.releaseEvents ?? []) push({ kind: 'release', at: r.releasedAt, data: r });
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at));
    return map;
  }, [data]);

  const todayKey = dayKey(today);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });

  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: '-.01em' }}>
          {monthLabel}
        </Box>
        <Box sx={{ display: 'flex', gap: '5px' }}>
          <NavButton label="Previous month" onClick={() => step(-1)}>‹</NavButton>
          <NavButton
            label="This month"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Today
          </NavButton>
          <NavButton label="Next month" onClick={() => step(1)}>›</NavButton>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Legend color={T.pr} label="Artifact version published" />
        <Legend color={T.recv} label="Workflow release" />
        {isError && (
          <Box sx={{ fontSize: 11.5, color: T.danger }}>Could not load this month.</Box>
        )}
      </Box>

      <Box
        sx={{
          border: `1px solid ${T.ln}`, borderRadius: '14px', overflow: 'hidden', background: T.sf,
          opacity: isLoading || isPlaceholderData ? 0.6 : 1,
          transition: 'opacity .14s ease',
        }}
      >
        <Box
          sx={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            background: T.sf2, borderBottom: `1px solid ${T.ln}`,
          }}
        >
          {WEEKDAYS.map((w) => (
            <Box
              key={w}
              sx={{
                padding: '7px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em',
                textTransform: 'uppercase', color: T.dm2,
              }}
            >
              {w}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((day) => {
            const key = dayKey(day);
            const inMonth = day.getMonth() === cursor.month;
            const events = byDay.get(key) ?? [];
            return (
              <DayCell
                key={key}
                day={day}
                inMonth={inMonth}
                isToday={key === todayKey}
                events={events}
                onOpen={() => events.length && setOpenDay(key)}
              />
            );
          })}
        </Box>
      </Box>

      {openDay && (
        <DayDialog
          dayKey={openDay}
          events={byDay.get(openDay) ?? []}
          onClose={() => setOpenDay(null)}
          onOpenRelease={(row) => {
            setOpenDay(null);
            onOpenRelease(row);
          }}
        />
      )}
    </Box>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '3px', background: color }} />
      <Box sx={{ fontSize: 11, color: T.dm }}>{label}</Box>
    </Box>
  );
}

function NavButton({
  onClick, label, children,
}: {
  onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onClick={onClick}
      sx={{
        minWidth: 28, height: 26, padding: '0 8px',
        display: 'grid', placeItems: 'center',
        border: `1px solid ${T.ln2}`, borderRadius: '7px', background: T.sf,
        color: T.tx, fontFamily: 'inherit', fontSize: 12, cursor: CURSOR_POINTER,
        '&:hover': { background: T.sf3 },
      }}
    >
      {children}
    </Box>
  );
}

/** 칸 하나. 칩이 넘치면 "+N"으로 접고, 누르면 그날 전체를 다이얼로그로 편다. */
function DayCell({
  day, inMonth, isToday, events, onOpen,
}: {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  events: DayEvent[];
  onOpen: () => void;
}) {
  const MAX_CHIPS = 3;
  const shown = events.slice(0, MAX_CHIPS);
  const hidden = events.length - shown.length;

  return (
    <Box
      onClick={onOpen}
      sx={{
        minHeight: 96, padding: '6px 7px',
        borderRight: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
        background: inMonth ? T.sf : T.sf2,
        cursor: events.length ? CURSOR_POINTER : 'default',
        display: 'flex', flexDirection: 'column', gap: '3px',
        '&:nth-of-type(7n)': { borderRight: 'none' },
        '&:hover': events.length ? { background: inMonth ? T.sf2 : T.sf3 } : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Box
          sx={{
            fontSize: 11, fontWeight: isToday ? 800 : 600, fontFamily: FONT_MONO,
            color: isToday ? T.prTx : inMonth ? T.tx2 : T.dm2,
            background: isToday ? T.pr : 'transparent',
            borderRadius: '5px', padding: isToday ? '1px 5px' : '1px 0',
          }}
        >
          {day.getDate()}
        </Box>
      </Box>

      {shown.map((e, i) => (
        <EventChip key={`${e.kind}-${i}-${e.at}`} event={e} />
      ))}
      {hidden > 0 && (
        <Box sx={{ fontSize: 10, color: T.dm2, pl: '2px' }}>+{hidden} more</Box>
      )}
    </Box>
  );
}

/**
 * 색이 곧 종류다. 발행(publish)과 release가 같은 칸에 섞여도 한눈에 갈리도록,
 * 미발행(working) 버전만 테두리를 점선으로 하고 채움을 비운다 — 색을 하나 더 늘리지 않는다.
 */
function EventChip({ event }: { event: DayEvent }) {
  if (event.kind === 'release') {
    const r = event.data;
    return (
      <Box
        sx={{
          fontSize: 10, lineHeight: 1.35, borderRadius: '5px', padding: '2px 5px',
          background: T.recvSoft, color: T.recv, border: `1px solid ${T.recv}`,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {r.label} {r.workflowAt.name}
      </Box>
    );
  }
  const v = event.data;
  return (
    <Box
      sx={{
        fontSize: 10, lineHeight: 1.35, borderRadius: '5px', padding: '2px 5px',
        background: v.isPublished ? T.prSoft : 'transparent',
        color: v.isPublished ? T.pr : T.dm,
        border: v.isPublished ? `1px solid ${T.prLine}` : `1px dashed ${T.ln2}`,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {v.artifactName} · {v.versionLabel}
    </Box>
  );
}

/** 하루치 전체. release 항목만 클릭 대상이다 — 버전 event는 아직 열 곳을 정하지 않았다. */
function DayDialog({
  dayKey: key, events, onClose, onOpenRelease,
}: {
  dayKey: string;
  events: DayEvent[];
  onClose: () => void;
  onOpenRelease: (row: MyReleaseRowDto) => void;
}) {
  return (
    <ModalShell
      open
      onClose={onClose}
      width={620}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <Box sx={{ fontSize: 15, fontWeight: 700, fontFamily: FONT_MONO }}>{key}</Box>
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>
            {events.length} event{events.length === 1 ? '' : 's'}
          </Box>
        </Box>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {events.map((e, i) =>
          e.kind === 'release' ? (
            <Box
              key={`r-${i}`}
              component="button"
              type="button"
              onClick={() => onOpenRelease(e.data)}
              sx={{
                textAlign: 'left', fontFamily: 'inherit', width: '100%',
                border: `1px solid ${T.recv}`, background: T.recvSoft, borderRadius: '10px',
                padding: '10px 12px', cursor: CURSOR_POINTER,
                '&:hover': { filter: 'brightness(0.98)' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <Badge color={T.recv} bg={T.sf} borderColor={T.recv}>RELEASE</Badge>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>{e.data.label}</Box>
                <Box sx={{ fontSize: 12.5, fontWeight: 700 }}>{e.data.workflowAt.name}</Box>
                <Box sx={{ fontSize: 11, color: T.dm }}>
                  {canonicalDepartmentLabel(e.data.workflowAt.department)}
                </Box>
                <Box sx={{ flex: 1 }} />
                <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>
                  {fmtAt(e.data.releasedAt)}
                </Box>
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm, mt: '4px' }}>
                {e.data.projectCode} · {e.data.itemCount} artifacts
                {e.data.received ? ' · received' : ''}
                {e.data.published ? ' · published by my department' : ''}
              </Box>
            </Box>
          ) : (
            <Box
              key={`v-${i}`}
              sx={{
                border: `1px solid ${T.ln}`, background: T.sf, borderRadius: '10px',
                padding: '10px 12px',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <Badge
                  color={e.data.isPublished ? T.pr : T.dm}
                  bg={e.data.isPublished ? T.prSoft : T.sf3}
                  borderColor={e.data.isPublished ? T.prLine : T.ln2}
                >
                  {e.data.isPublished ? 'VERSION' : 'WORKING'}
                </Badge>
                <Box sx={{ fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {e.data.artifactName}
                </Box>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, color: T.pr }}>
                  {e.data.versionLabel}
                </Box>
                <NetworkTag network={e.data.network} />
                <Box sx={{ flex: 1 }} />
                <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>
                  {fmtAt(e.data.occurredAt)}
                </Box>
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm, mt: '4px' }}>
                {TIER_LABEL[e.data.tier]} · {e.data.projectCode}
                {e.data.placements.length > 0 &&
                  ` · ${e.data.placements.map((p) => p.workflowName).join(', ')}`}
              </Box>
            </Box>
          ),
        )}
        {!events.length && (
          <Ey sx={{ textAlign: 'center', padding: '20px 0' }}>No events</Ey>
        )}
      </Box>
    </ModalShell>
  );
}
