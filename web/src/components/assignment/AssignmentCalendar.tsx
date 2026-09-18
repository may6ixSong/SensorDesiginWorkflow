import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import Cookies from 'js-cookie';
import { Badge } from '@/components/common/SirenButton';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { VersionEventDialog } from './VersionEventDialog';
import { colorForKnoxId } from '@/app/providers/DirectoryProvider';
import { useMyCalendar } from '@/api/hooks/useAssignments';
import { useProjects } from '@/api/hooks/useProjects';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyReleaseRowDto, ProjectDto, VersionEventDto } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 마지막으로 고른 Month/Week를 다음 접속에도 이어간다(사용자 요청) — 유효기간은
 * 딱히 없어도 되는 순수 UI 선호값이라 넉넉히 1년으로 둔다. */
const VIEW_MODE_COOKIE = 'siren-my-assignment-calendar-view';

/** 로컬 기준 'YYYY-MM-DD' — 격자의 칸을 고르는 키다. UTC로 만들면 하루가 밀린다. */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, delta: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
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

/** anchor가 속한 주(일~토) 7일. */
function weekRange(anchor: Date): { start: Date; end: Date; days: Date[] } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  const days: Date[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < 7; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { start, end: new Date(cursor), days };
}

function formatWeekLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { month: 'short', day: 'numeric' } : { day: 'numeric' });
  return sameMonth
    ? `${fmt(first, true)} – ${fmt(last, false)}, ${last.getFullYear()}`
    : `${fmt(first, true)} – ${fmt(last, true)}, ${last.getFullYear()}`;
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

type ViewMode = 'month' | 'week';
type DayEvent =
  | { kind: 'release'; at: string; data: MyReleaseRowDto }
  | { kind: 'version'; at: string; data: VersionEventDto };

function readSavedViewMode(): ViewMode {
  return Cookies.get(VIEW_MODE_COOKIE) === 'week' ? 'week' : 'month';
}

/**
 * 날짜별 event 달력 (설계서 09장 §5) — 3분할 레이아웃이다.
 *
 *   A(project 범례, ~10%) | B(달력 그리드, ~70%) | C(선택한 날의 event 목록, ~20%)
 *
 * 색은 **과제(project)** 단위다 — A의 범례가 그 색과 이니셜을 정의하고, B의 칩과 C의
 * 행이 같은 색을 그대로 쓴다. release/version 구분은 색이 아니라 **모양**으로 갈린다
 * (release는 각진 마커, version은 원형 마커 — 미발행 버전은 그 원을 점선으로 비운다).
 *
 * ★ 한 화면(월 또는 주) 범위의 event만 읽는다 — 범위를 옮기거나 월/주를 전환할 때마다
 *   그 범위만 다시 부른다(이미 본 범위는 캐시에 남는다).
 * ★ C의 행을 눌러도 추가 조회가 새로 나가는 것은 release뿐이다(release 상세 1건). version
 *   event는 이미 이 화면이 들고 있는 값만 다이얼로그에 그대로 보여준다 — 권한을 다시
 *   묻지 않으므로 세세한 정보까지는 보여주지 않는다.
 * ★ Month/Week 선택은 쿠키에 남겨 다음 접속에도 이어간다(사용자 요청).
 */
export function AssignmentCalendar({ onOpenRelease }: { onOpenRelease: (row: MyReleaseRowDto) => void }) {
  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewModeState] = useState<ViewMode>(readSavedViewMode);
  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    Cookies.set(VIEW_MODE_COOKIE, v, { expires: 365, sameSite: 'lax' });
  };
  const [focusDate, setFocusDate] = useState(today);
  const [selectedKey, setSelectedKey] = useState(dayKey(today));
  const [openVersion, setOpenVersion] = useState<VersionEventDto | null>(null);

  const { data: projects = [] } = useProjects();

  const { start, end, days } = useMemo(
    () => (viewMode === 'month' ? gridRange(focusDate.getFullYear(), focusDate.getMonth()) : weekRange(focusDate)),
    [viewMode, focusDate],
  );
  const { data, isLoading, isError, isPlaceholderData } = useMyCalendar(start.toISOString(), end.toISOString());

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
  const selectedEvents = byDay.get(selectedKey) ?? [];

  const goToday = () => {
    setFocusDate(new Date());
    setSelectedKey(dayKey(new Date()));
  };
  const step = (delta: number) =>
    setFocusDate((d) =>
      viewMode === 'month' ? new Date(d.getFullYear(), d.getMonth() + delta, 1) : addDays(d, delta * 7),
    );
  const selectDay = (d: Date) => setSelectedKey(dayKey(d));
  /** 미니 달력 전용 — 지금 보이는 주 바깥 날짜를 고를 수 있으니, 선택과 함께 그 날짜가
   * 보이도록 포커스(주)도 함께 옮긴다. 월/주 그리드의 칸은 항상 이미 보이는 날짜라 필요 없다. */
  const jumpToDay = (d: Date) => {
    setFocusDate(d);
    setSelectedKey(dayKey(d));
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid', gap: '14px', height: '100%', minHeight: 0,
          // 10% · 70% · 30%였던 B/C 비율을 10% · 70% · 20%으로 조정했다(사용자 요청) — fr
          // 비율 1:7:2가 그 비율이다.
          gridTemplateColumns: 'minmax(128px, 1fr) minmax(360px, 7fr) minmax(190px, 2fr)',
          // ★ 명시적으로 'minmax(0, 1fr)'을 준다 — gridTemplateAreas만 쓰면 암묵적 행이
          //   'auto'(내용 크기)라, 안의 월간 격자 내용이 이 칸보다 커지는 순간 이 grid
          //   자체가 그 크기로 부풀어 오르고 바깥 overflow:hidden에 가려 스크롤할 방법 없이
          //   화면 아래가 통째로 안 보이는 사고가 난다(실측 — 짧은 화면에서 재현됨).
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateAreas: '"legend grid list"',
          '@media (max-width: 1150px)': {
            gridTemplateColumns: '1fr',
            gridTemplateRows: 'auto 460px 340px',
            gridTemplateAreas: '"legend" "grid" "list"',
          },
        }}
      >
        <ProjectLegendPanel
          projects={projects}
          viewMode={viewMode}
          focusMonth={focusDate}
          selectedKey={selectedKey}
          todayKey={todayKey}
          onSelectDay={jumpToDay}
        />

        <CalendarGridPanel
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          label={viewMode === 'month'
            ? focusDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
            : formatWeekLabel(days)}
          onStep={step}
          onToday={goToday}
          days={days}
          byDay={byDay}
          todayKey={todayKey}
          selectedKey={selectedKey}
          monthOf={focusDate.getMonth()}
          onSelectDay={selectDay}
          isLoading={isLoading}
          isPlaceholderData={isPlaceholderData}
          isError={isError}
        />

        <DayEventListPanel
          dayKey={selectedKey}
          events={selectedEvents}
          onOpenRelease={onOpenRelease}
          onOpenVersion={setOpenVersion}
        />
      </Box>

      {openVersion && (
        <VersionEventDialog event={openVersion} onClose={() => setOpenVersion(null)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * A — project 범례 (+ 주간 보기일 때 이번 달 미니 달력)
 * ------------------------------------------------------------------ */

function ProjectLegendPanel({
  projects, viewMode, focusMonth, selectedKey, todayKey, onSelectDay,
}: {
  projects: ProjectDto[];
  viewMode: ViewMode;
  focusMonth: Date;
  selectedKey: string;
  todayKey: string;
  onSelectDay: (d: Date) => void;
}) {
  return (
    <Box
      sx={{
        gridArea: 'legend',
        border: `1px solid ${T.ln}`, borderRadius: '14px', background: T.sf,
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', mb: '14px' }}>
          {projects.map((p) => (
            <Box key={p._id} title={p.name} sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              {/* 이니셜은 project name 첫 글자로 뽑는다(사용자 확정) — 옆의 표시 텍스트는
                  여전히 project code다, 그건 다른 값이다. */}
              <InitialBadge color={colorForKnoxId(p._id)} label={p.name} />
              <Box
                sx={{
                  fontSize: 10.5, color: T.tx2, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {p.code}
              </Box>
            </Box>
          ))}
          {!projects.length && <Box sx={{ fontSize: 10.5, color: T.dm2 }}>No projects</Box>}
        </Box>

        <Box sx={{ height: '1px', background: T.ln, mb: '12px' }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <TypeLegendRow shape="square" filled label="Release" />
          <TypeLegendRow shape="circle" filled label="Version" />
          <TypeLegendRow shape="circle" filled={false} label="Working" />
        </Box>

        {viewMode === 'week' && (
          <>
            <Box sx={{ height: '1px', background: T.ln, my: '12px' }} />
            <MiniMonthCalendar month={focusMonth} selectedKey={selectedKey} todayKey={todayKey} onSelect={onSelectDay} />
          </>
        )}
      </Box>
    </Box>
  );
}

function InitialBadge({ color, label }: { color: string; label: string }) {
  const initial = (label.trim()[0] ?? '?').toUpperCase();
  return (
    <Box
      sx={{
        width: 18, height: 18, borderRadius: '5px', background: color, color: '#fff',
        fontSize: 9.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: '0 0 auto',
      }}
    >
      {initial}
    </Box>
  );
}

function TypeLegendRow({ shape, filled, label }: { shape: 'square' | 'circle'; filled: boolean; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <EventMarker color={T.dm2} shape={shape} filled={filled} />
      <Box sx={{ fontSize: 10.5, color: T.dm }}>{label}</Box>
    </Box>
  );
}

/** 이벤트가 없는 순수 날짜 격자 — 주간 보기에서 이번 달 맥락을 보여주는 자리다. */
function MiniMonthCalendar({
  month, selectedKey, todayKey, onSelect,
}: {
  month: Date;
  selectedKey: string;
  todayKey: string;
  onSelect: (d: Date) => void;
}) {
  const { days } = useMemo(() => gridRange(month.getFullYear(), month.getMonth()), [month]);
  const label = month.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Box>
      <Box sx={{ fontSize: 10.5, fontWeight: 700, color: T.dm2, mb: '6px' }}>{label}</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {days.map((d) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === month.getMonth();
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          return (
            <Box
              key={key}
              component="button"
              type="button"
              onClick={() => onSelect(d)}
              sx={{
                fontFamily: 'inherit', border: 'none', cursor: CURSOR_POINTER,
                width: '100%', aspectRatio: '1', borderRadius: '4px',
                fontSize: 9, fontWeight: isSelected || isToday ? 700 : 500,
                color: isSelected ? T.prTx : isToday ? T.pr : inMonth ? T.tx2 : T.dm2,
                background: isSelected ? T.pr : isToday ? T.prSoft : 'transparent',
                '&:hover': { background: isSelected ? T.pr : T.sf3 },
              }}
            >
              {d.getDate()}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 * B — 달력 그리드 (월/주 전환)
 * ------------------------------------------------------------------ */

function CalendarGridPanel({
  viewMode, onChangeViewMode, label, onStep, onToday,
  days, byDay, todayKey, selectedKey, monthOf, onSelectDay,
  isLoading, isPlaceholderData, isError,
}: {
  viewMode: ViewMode;
  onChangeViewMode: (v: ViewMode) => void;
  label: string;
  onStep: (delta: number) => void;
  onToday: () => void;
  days: Date[];
  byDay: Map<string, DayEvent[]>;
  todayKey: string;
  selectedKey: string;
  monthOf: number;
  onSelectDay: (d: Date) => void;
  isLoading: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
}) {
  return (
    <Box
      sx={{
        gridArea: 'grid',
        border: `1px solid ${T.ln}`, borderRadius: '14px', background: T.sf,
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '11px 14px', borderBottom: `1px solid ${T.ln}`, background: T.sf2,
        }}
      >
        <Box sx={{ fontSize: 14, fontWeight: 700 }}>{label}</Box>
        <Box sx={{ display: 'flex', gap: '4px' }}>
          <NavButton label="Previous" onClick={() => onStep(-1)}>‹</NavButton>
          <NavButton label="Today" onClick={onToday}>Today</NavButton>
          <NavButton label="Next" onClick={() => onStep(1)}>›</NavButton>
        </Box>
        <Box sx={{ flex: 1 }} />
        <ViewToggle value={viewMode} onChange={onChangeViewMode} />
        {isError && <Box sx={{ fontSize: 11, color: T.danger }}>Could not load this range.</Box>}
      </Box>

      <Box
        sx={{
          flex: 1, minHeight: 0, overflow: 'auto',
          opacity: isLoading || isPlaceholderData ? 0.6 : 1,
          transition: 'opacity .14s ease',
        }}
      >
        {viewMode === 'month' ? (
          <MonthGrid
            days={days} byDay={byDay} todayKey={todayKey} selectedKey={selectedKey}
            monthOf={monthOf} onSelectDay={onSelectDay}
          />
        ) : (
          <WeekGrid
            days={days} byDay={byDay} todayKey={todayKey} selectedKey={selectedKey}
            onSelectDay={onSelectDay}
          />
        )}
      </Box>
    </Box>
  );
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <Box sx={{ display: 'flex', border: `1px solid ${T.ln2}`, borderRadius: '8px', overflow: 'hidden' }}>
      {(['month', 'week'] as const).map((v) => (
        <Box
          key={v}
          component="button"
          type="button"
          onClick={() => onChange(v)}
          sx={{
            fontFamily: 'inherit', border: 'none', cursor: CURSOR_POINTER,
            padding: '5px 12px', fontSize: 11.5, fontWeight: 600,
            background: value === v ? T.pr : T.sf, color: value === v ? T.prTx : T.dm,
            '&:hover': { background: value === v ? T.pr : T.sf3 },
          }}
        >
          {v === 'month' ? 'Month' : 'Week'}
        </Box>
      ))}
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
        minWidth: 26, height: 26, padding: '0 8px',
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

function MonthGrid({
  days, byDay, todayKey, selectedKey, monthOf, onSelectDay,
}: {
  days: Date[];
  byDay: Map<string, DayEvent[]>;
  todayKey: string;
  selectedKey: string;
  monthOf: number;
  onSelectDay: (d: Date) => void;
}) {
  return (
    <>
      <Box
        sx={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: T.sf2, borderBottom: `1px solid ${T.ln}`,
          position: 'sticky', top: 0, zIndex: 1,
        }}
      >
        {WEEKDAYS.map((w) => (
          <Box
            key={w}
            sx={{
              padding: '6px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
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
          return (
            <DayCell
              key={key}
              day={day}
              inMonth={day.getMonth() === monthOf}
              isToday={key === todayKey}
              isSelected={key === selectedKey}
              events={byDay.get(key) ?? []}
              onClick={() => onSelectDay(day)}
              cellSize={100}
              maxChips={2}
              showRightBorder
            />
          );
        })}
      </Box>
    </>
  );
}

function WeekGrid({
  days, byDay, todayKey, selectedKey, onSelectDay,
}: {
  days: Date[];
  byDay: Map<string, DayEvent[]>;
  todayKey: string;
  selectedKey: string;
  onSelectDay: (d: Date) => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: '100%', minHeight: 360 }}>
      {days.map((day) => {
        const key = dayKey(day);
        return (
          <Box
            key={key}
            sx={{
              display: 'flex', flexDirection: 'column',
              borderRight: `1px solid ${T.ln}`,
              '&:last-of-type': { borderRight: 'none' },
            }}
          >
            <Box
              sx={{
                padding: '6px 8px', fontSize: 10, fontWeight: 700, color: T.dm2,
                textTransform: 'uppercase', borderBottom: `1px solid ${T.ln}`, background: T.sf2,
              }}
            >
              {WEEKDAYS[day.getDay()]}
            </Box>
            <DayCell
              day={day}
              inMonth
              isToday={key === todayKey}
              isSelected={key === selectedKey}
              events={byDay.get(key) ?? []}
              onClick={() => onSelectDay(day)}
              cellSize={280}
              maxChips={10}
              showRightBorder={false}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * 칸 하나. 클릭하면 이 날짜를 선택하고, 선택 결과는 C 패널에 인라인으로 나온다.
 *
 * ★ 월간 보기(`showRightBorder: true`)는 **모든 칸이 완전히 같은 크기**여야 한다(사용자
 *   요청) — event 개수가 몇 개든 칸 크기가 흔들리면 안 된다. `minHeight`(내용에 따라
 *   자라는 하한선)가 아니라 고정 `height` + `overflow: hidden`을 쓴다 — CSS Grid는 한
 *   행 안에서 가장 큰 셀에 맞춰 그 행 전체가 늘어나므로, `minHeight`만으로는 event가
 *   많은 주(week)만 유독 키가 커진다. 넘치는 event는 "+N more"로 요약하고, 자세한
 *   내용은 그 날짜를 클릭해 C 패널에서 본다.
 * ★ 주간 보기(`showRightBorder: false`)는 이미 flexbox(`flex: 1`)로 다른 요일 칸과 같은
 *   높이를 맞추고 있어(칼럼들이 같은 높이의 부모 안에서 나눠 갖는다) 이 문제가 없다 —
 *   `minHeight`를 그대로 쓴다.
 */
function DayCell({
  day, inMonth, isToday, isSelected, events, onClick, cellSize, maxChips, showRightBorder,
}: {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: DayEvent[];
  onClick: () => void;
  cellSize: number;
  maxChips: number;
  showRightBorder: boolean;
}) {
  const shown = events.slice(0, maxChips);
  const hidden = events.length - shown.length;

  return (
    <Box
      onClick={onClick}
      sx={{
        padding: '5px 6px',
        ...(showRightBorder
          ? { height: cellSize, overflow: 'hidden' }
          : { minHeight: cellSize, flex: 1 }),
        borderRight: showRightBorder ? `1px solid ${T.ln}` : 'none',
        borderBottom: `1px solid ${T.ln}`,
        background: isSelected ? T.prSoft : inMonth ? T.sf : T.sf2,
        outline: isSelected ? `1.5px solid ${T.pr}` : 'none',
        outlineOffset: '-1.5px',
        cursor: CURSOR_POINTER,
        display: 'flex', flexDirection: 'column', gap: '3px',
        ...(showRightBorder ? { '&:nth-of-type(7n)': { borderRight: 'none' } } : {}),
        '&:hover': { background: isSelected ? T.prSoft : inMonth ? T.sf2 : T.sf3 },
      }}
    >
      <Box
        sx={{
          fontSize: 10.5, fontWeight: isToday ? 800 : 600, fontFamily: FONT_MONO,
          color: isToday ? T.prTx : inMonth ? T.tx2 : T.dm2,
          background: isToday ? T.pr : 'transparent',
          borderRadius: '4px', padding: isToday ? '0 4px' : '0', width: 'fit-content',
        }}
      >
        {day.getDate()}
      </Box>

      {shown.map((e, i) => (
        <EventChip key={`${e.kind}-${i}-${e.at}`} event={e} />
      ))}
      {hidden > 0 && <Box sx={{ fontSize: 9.5, color: T.dm2 }}>+{hidden} more</Box>}
    </Box>
  );
}

/**
 * 색은 project, 모양은 종류다 — release는 각진 마커, version은 원형 마커. 미발행 버전만
 * 그 원을 점선으로 비워 구분한다(색을 하나 더 늘리지 않는다).
 */
function EventMarker({ color, shape, filled }: { color: string; shape: 'square' | 'circle'; filled: boolean }) {
  return (
    <Box
      sx={{
        width: 7, height: 7, flex: '0 0 auto',
        borderRadius: shape === 'circle' ? '50%' : '2px',
        background: filled ? color : 'transparent',
        border: `1.3px ${filled ? 'solid' : 'dashed'} ${color}`,
      }}
    />
  );
}

function EventChip({ event }: { event: DayEvent }) {
  const color = colorForKnoxId(event.data.projectId);
  const label = event.kind === 'release'
    ? `${event.data.label} ${event.data.workflowAt.name}`
    : `${event.data.artifactName} · ${event.data.versionLabel}`;
  const filled = event.kind === 'release' ? true : event.data.isPublished;

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: 9.5, borderRadius: '4px', padding: '1.5px 4px',
        background: T.sf2, border: `1px solid ${T.ln}`, overflow: 'hidden',
      }}
    >
      <EventMarker color={color} shape={event.kind === 'release' ? 'square' : 'circle'} filled={filled} />
      <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.tx2 }}>
        {label}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 * C — 선택한 날짜의 event 목록 (다이얼로그가 아니라 이 자리에 그대로)
 * ------------------------------------------------------------------ */

function DayEventListPanel({
  dayKey: key, events, onOpenRelease, onOpenVersion,
}: {
  dayKey: string;
  events: DayEvent[];
  onOpenRelease: (row: MyReleaseRowDto) => void;
  onOpenVersion: (v: VersionEventDto) => void;
}) {
  return (
    <Box
      sx={{
        gridArea: 'list',
        border: `1px solid ${T.ln}`, borderRadius: '14px', background: T.sf,
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      }}
    >
      <Box sx={{ padding: '13px 15px', borderBottom: `1px solid ${T.ln}`, background: T.sf2 }}>
        <Box
          sx={{
            fontSize: 13, fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {formatDayLabel(key)}
        </Box>
        <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '2px' }}>
          {events.length} event{events.length === 1 ? '' : 's'}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '9px' }}>
        {!events.length ? (
          <Box
            sx={{
              border: `1px dashed ${T.ln2}`, borderRadius: '10px',
              padding: '26px 14px', textAlign: 'center', fontSize: 11.5, color: T.dm2,
            }}
          >
            No events on this day.
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {events.map((e, i) => (
              e.kind === 'release' ? (
                <ReleaseEventRow key={`r-${i}`} row={e.data} onClick={() => onOpenRelease(e.data)} />
              ) : (
                <VersionEventRow key={`v-${i}`} event={e.data} onClick={() => onOpenVersion(e.data)} />
              )
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * ★ C 패널이 20%로 좁아지면서(사용자 요청) 한 줄에 다 못 넣는다 — flex-wrap으로 줄바꿈해
 *   키를 늘리는 대신, 덜 중요한 정보(수신/발행 배지, 부서명 전체)부터 줄이고 나머지는
 *   `text-overflow:ellipsis`로 잘라 보인다. 필요하면 release 상세 다이얼로그에서 전부
 *   다시 볼 수 있으니 여기서 잘려도 정보 손실이 아니다.
 */
function ReleaseEventRow({ row, onClick }: { row: MyReleaseRowDto; onClick: () => void }) {
  const color = colorForKnoxId(row.projectId);
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        textAlign: 'left', width: '100%', fontFamily: 'inherit',
        border: `1px solid ${T.recv}`, background: T.recvSoft, borderRadius: '10px',
        padding: '9px 11px', cursor: CURSOR_POINTER, overflow: 'hidden',
        '&:hover': { filter: 'brightness(0.98)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <EventMarker color={color} shape="square" filled />
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, flex: '0 0 auto' }}>
          {row.label}
        </Box>
        <Box
          sx={{
            fontSize: 12, fontWeight: 700, minWidth: 0, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {row.workflowAt.name}
        </Box>
      </Box>
      <Box
        sx={{
          fontSize: 10.5, color: T.dm, mt: '3px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {canonicalDepartmentLabel(row.workflowAt.department)} · {fmtAt(row.releasedAt)}
      </Box>
      <Box
        sx={{
          fontSize: 10.5, color: T.dm2, mt: '2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {row.projectCode} · {row.itemCount} artifacts
      </Box>
    </Box>
  );
}

function VersionEventRow({ event, onClick }: { event: VersionEventDto; onClick: () => void }) {
  const color = colorForKnoxId(event.projectId);
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        textAlign: 'left', width: '100%', fontFamily: 'inherit',
        border: `1px solid ${T.ln}`, background: T.sf, borderRadius: '10px',
        padding: '9px 11px', cursor: CURSOR_POINTER, overflow: 'hidden',
        '&:hover': { background: T.sf2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <EventMarker color={color} shape="circle" filled={event.isPublished} />
        <Box
          sx={{
            fontSize: 12, fontWeight: 700, minWidth: 0, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {event.artifactName}
        </Box>
        <NetworkTag network={event.network} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', mt: '3px', minWidth: 0 }}>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.pr, flex: '0 0 auto' }}>
          {event.versionLabel}
        </Box>
        {!event.isPublished && (
          <Badge color={T.dm} bg={T.sf3} borderColor={T.ln2}>WORKING</Badge>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: FONT_MONO, flex: '0 0 auto' }}>
          {fmtAt(event.occurredAt)}
        </Box>
      </Box>
      <Box
        sx={{
          fontSize: 10.5, color: T.dm2, mt: '2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {event.projectCode}
        {event.placements.length > 0 && ` · ${event.placements.map((p) => p.workflowName).join(', ')}`}
      </Box>
    </Box>
  );
}
