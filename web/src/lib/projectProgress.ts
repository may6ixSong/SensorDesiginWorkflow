import { PhaseRef } from '@/types/domain';

/** 오늘 날짜가 phases 구간의 어디쯤인지 → 진행률(%)과 현재 Phase. */
export function progressOf(phases: PhaseRef[]) {
  const ph = [...phases].sort((a, b) => a.order - b.order);
  if (!ph.length) return { pct: 0, current: null as string | null, done: 0, total: 0 };
  const now = Date.now();
  const done = ph.filter((x) => new Date(x.end).getTime() < now).length;
  const current = ph.find((x) => new Date(x.start).getTime() <= now && now <= new Date(x.end).getTime());
  const s = new Date(ph[0].start).getTime();
  const e = new Date(ph[ph.length - 1].end).getTime();
  const pct = Math.round(Math.min(1, Math.max(0, (now - s) / (e - s || 1))) * 100);
  return { pct, current: current?.key ?? (done >= ph.length ? 'Done' : ph[0].key), done, total: ph.length };
}
