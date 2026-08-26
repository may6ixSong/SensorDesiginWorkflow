/**
 * 일정(마일스톤 / workflow phase) 공통 규칙 — FE의 web/src/lib/schedule.ts와 같은 규칙을
 * 구현한다. 두 축이 있다:
 *
 *  - 과제 마일스톤(Project.milestones): 모든 workflow가 공유하는 큰 일정.
 *  - workflow phase(Workflow.phases): workflow마다 완전히 다르게 잡는 자기 일정.
 *
 * 둘 다 { id, name, start, end } 모양이고 정렬 규칙도 같아서 한 곳에 모아 둔다.
 *
 * ★ 순서는 저장하지 않는다. 항상 start 오름차순으로 파생한다 — 일정이 서로 겹치는 것을
 *   허용하기 때문에(설계 변경), "몇 번째 phase인가"를 사람이 손으로 정해 두면 날짜와
 *   어긋난 순서가 그대로 굳어 버린다. 시작일이 같으면 종료일이 빠른 쪽, 그것도 같으면
 *   이름, 마지막으로 id로 결정한다(항상 같은 순서가 나오도록).
 */

export interface ScheduleSpan {
  id: string;
  name: string;
  start: string;
  end: string;
}

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

/** 새 phase/마일스톤 id — 충돌 확률이 사실상 없고 URL/JSON에 안전한 짧은 값. */
export function newSpanId(prefix = 'ph'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 일정 목록 검증 + 정규화. 겹침은 허용한다(설계 변경) — 검사하는 것은 각 구간이
 * 그 자체로 말이 되는지(시작 ≤ 종료)와 id/이름이 비어 있지 않은지뿐이다.
 *
 * @param label 오류 메시지에 쓸 대상 이름("Milestone" / "Phase").
 */
export function normalizeSchedule(
  input: { id?: string; name: string; start: string; end: string }[],
  label: string,
  idPrefix: string,
  fail: (message: string) => never,
): ScheduleSpan[] {
  if (!Array.isArray(input) || input.length === 0) {
    fail(`At least one ${label.toLowerCase()} is required.`);
  }
  const seen = new Set<string>();
  const out: ScheduleSpan[] = [];
  for (const raw of input) {
    const name = (raw.name ?? '').trim();
    if (!name) fail(`${label} name cannot be empty.`);
    if (!DATE_RE.test(raw.start) || !DATE_RE.test(raw.end)) {
      fail(`${label} '${name}': dates must be YYYY-MM-DD.`);
    }
    // 시작일 == 종료일(하루짜리 일정)은 허용한다 — 마일스톤은 원래 "점"에 가깝다.
    if (raw.start > raw.end) fail(`${label} '${name}': start date must not be after the end date.`);
    const id = (raw.id ?? '').trim() || newSpanId(idPrefix);
    if (seen.has(id)) fail(`${label} '${name}': duplicated id.`);
    seen.add(id);
    out.push({ id, name, start: raw.start, end: raw.end });
  }
  return sortSchedule(out);
}
