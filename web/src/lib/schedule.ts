/**
 * 일정(과제 마일스톤 / workflow phase) 공통 규칙 — api/src/common/schedule.ts와 같은 규칙을
 * FE 쪽에 구현한 것이다. 두 축이 있다:
 *
 *   과제 마일스톤(ProjectDto.milestones) : 모든 workflow가 공유하는 큰 일정.
 *   workflow phase(WorkflowDto.phases)   : workflow마다 완전히 다르게 잡는 자기 일정.
 *
 * 둘 다 ScheduleSpan({ id, name, start, end })이라 정렬·날짜 계산을 여기 한 곳에 모은다.
 *
 * ★ 순서는 저장하지 않고 start 오름차순으로 파생한다 — 일정끼리 겹치는 것을 허용하기
 *   때문에, 손으로 매긴 순서를 저장하면 날짜와 어긋난 순서가 그대로 굳어 버린다.
 *   캔버스가 "좌 → 우"로 흐르는 것은 이 정렬 결과 그대로다.
 */
import { ScheduleSpan } from '@/types/domain';

export const DAY_MS = 864e5;

/** 'YYYY-MM-DD' → epoch ms (로컬 자정). 잘못된 값이면 NaN. */
export function dayMs(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

/** start 오름차순 → end 오름차순 → 이름 → id. 항상 같은 순서가 나온다. */
export function sortSchedule<T extends ScheduleSpan>(spans: T[]): T[] {
  return [...spans].sort((a, b) => {
    const s = a.start.localeCompare(b.start);
    if (s !== 0) return s;
    const e = a.end.localeCompare(b.end);
    if (e !== 0) return e;
    const n = a.name.localeCompare(b.name);
    return n !== 0 ? n : a.id.localeCompare(b.id);
  });
}

/** 며칠짜리 구간인지 (하루짜리도 1일로 센다). */
export function spanDays(s: ScheduleSpan): number {
  return Math.max(1, Math.round((dayMs(s.end) - dayMs(s.start)) / DAY_MS));
}

export type SpanState = 'past' | 'current' | 'upcoming';

export function spanState(s: ScheduleSpan, now = Date.now()): SpanState {
  if (now < dayMs(s.start)) return 'upcoming';
  // end는 그날 하루를 포함한다 — 종료일 당일에 "이미 지났다"고 뜨면 안 된다.
  if (now > dayMs(s.end) + DAY_MS) return 'past';
  return 'current';
}

/** 날짜 범위. 아무 일정도 없으면 null. */
export interface DateRange { startMs: number; endMs: number }

/**
 * 여러 일정 묶음을 다 덮는 범위.
 *
 * 프로젝트 타임라인/3D 뷰의 x축은 이 범위로 만든다. 과제 마일스톤만으로 잡으면
 * 마일스톤 밖으로 나간 workflow phase(예: 마일스톤보다 늦게 끝나는 SIGNOFF)가 축
 * 바깥으로 밀려나 화면에서 사라진다 — 그래서 마일스톤과 모든 workflow phase의 합집합을 쓴다.
 */
export function rangeOf(...groups: ScheduleSpan[][]): DateRange | null {
  let startMs = Infinity;
  let endMs = -Infinity;
  groups.forEach((g) => g.forEach((s) => {
    const a = dayMs(s.start);
    const b = dayMs(s.end);
    if (Number.isFinite(a)) startMs = Math.min(startMs, a);
    if (Number.isFinite(b)) endMs = Math.max(endMs, b);
  }));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  // 모든 일정이 같은 하루에 몰린 극단적인 경우에도 축 폭이 0이 되지 않게 한다.
  if (endMs <= startMs) endMs = startMs + DAY_MS;
  return { startMs, endMs };
}

/** range를 0..1로 정규화한 위치. 범위 밖이면 0/1 밖으로도 나간다(자르지 않는다). */
export function ratioIn(range: DateRange, ms: number): number {
  return (ms - range.startMs) / (range.endMs - range.startMs);
}

/** 'YYYY-MM-DD' → 0..1 위치. */
export function ratioOfDate(range: DateRange, iso: string): number {
  return ratioIn(range, dayMs(iso));
}

/** 축에 눈금으로 찍을 월의 첫날 목록 — 범위가 길면 2~3개월 간격으로 솎아 낸다. */
export function monthTicks(range: DateRange, maxTicks = 14): { ms: number; label: string }[] {
  const out: { ms: number; label: string }[] = [];
  const d = new Date(range.startMs);
  d.setDate(1);
  if (d.getTime() < range.startMs) d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= range.endMs) {
    out.push({
      ms: d.getTime(),
      label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
    d.setMonth(d.getMonth() + 1);
  }
  if (out.length <= maxTicks) return out;
  const step = Math.ceil(out.length / maxTicks);
  return out.filter((_, i) => i % step === 0);
}

/** 새 phase/마일스톤 id — 서버가 발급하지만, 편집 중인 새 행에도 임시 키가 필요하다. */
export function newSpanId(prefix = 'ph'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 'YYYY-MM-DD' 짧은 표기 (연도 두 자리) — 좁은 칸에 날짜 구간을 적을 때. */
export function shortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(2) : iso;
}

/**
 * 다른 workflow에서 온 일정 구간을, 내 phase 목록 중 어디에 놓을지 고른다.
 *
 * Incoming 산출물(다른 workflow가 recvWorkflowId로 나를 지정한 것)에 쓴다 — 그 산출물의
 * phaseId는 주는 쪽 workflow의 것이라 내 목록에는 없다. 그래서 "그 일정이 끝나는 날"이
 * 내 어느 phase 안에 들어오는지로 정하고, 어디에도 안 들어오면 그 날짜에 가장 가까운
 * phase를 고른다. 내 phase가 하나도 없으면 null.
 */
export function matchPhaseByDate(phases: ScheduleSpan[], source: ScheduleSpan | null): string | null {
  if (!phases.length) return null;
  if (!source) return phases[phases.length - 1].id;
  const target = dayMs(source.end);
  const inside = phases.find((p) => target >= dayMs(p.start) && target <= dayMs(p.end) + DAY_MS);
  if (inside) return inside.id;
  let best = phases[0];
  let bestDist = Infinity;
  phases.forEach((p) => {
    const dist = Math.min(Math.abs(target - dayMs(p.start)), Math.abs(target - dayMs(p.end)));
    if (dist < bestDist) { bestDist = dist; best = p; }
  });
  return best.id;
}
