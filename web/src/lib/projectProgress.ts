import { Milestone } from '@/types/domain';
import { DAY_MS, dayMs, sortSchedule } from './schedule';

/**
 * 오늘 날짜가 과제 마일스톤 구간의 어디쯤인지 → 진행률(%)과 현재 마일스톤.
 *
 * 마일스톤끼리 겹칠 수 있으므로 "현재"가 여러 개일 수 있다 — 그중 가장 먼저 시작한
 * 것을 대표로 쓴다(정렬 순서가 곧 좌→우 순서다).
 */
export function progressOf(milestones: Milestone[]) {
  const ms = sortSchedule(milestones);
  if (!ms.length) return { pct: 0, current: null as string | null, done: 0, total: 0 };
  const now = Date.now();
  const done = ms.filter((x) => dayMs(x.end) + DAY_MS < now).length;
  const current = ms.find((x) => dayMs(x.start) <= now && now <= dayMs(x.end) + DAY_MS);
  const s = dayMs(ms[0].start);
  const e = Math.max(...ms.map((x) => dayMs(x.end)));
  const pct = Math.round(Math.min(1, Math.max(0, (now - s) / (e - s || 1))) * 100);
  return { pct, current: current?.name ?? (done >= ms.length ? 'Done' : ms[0].name), done, total: ms.length };
}
