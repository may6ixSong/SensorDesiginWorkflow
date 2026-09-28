import { downstreamOf, isOnCycle, shouldAutoFire, upstreamOf } from './auto-run-policy';

const e = (fromId: string, toId: string, bidirectional = false) => ({ fromId, toId, bidirectional });
const d = (iso: string) => new Date(iso);

describe('upstreamOf / downstreamOf', () => {
  it('follows one-way flows by direction, one hop only', () => {
    const edges = [e('a', 'c'), e('b', 'c'), e('c', 'd')];
    expect(upstreamOf('c', edges).sort()).toEqual(['a', 'b']);
    expect(upstreamOf('d', edges)).toEqual(['c']);
    expect(downstreamOf('a', edges)).toEqual(['c']);
    expect(downstreamOf('d', edges)).toEqual([]);
  });

  it('treats a two-way flow as both directions (same rule as release sources)', () => {
    const edges = [e('a', 'b', true)];
    expect(upstreamOf('a', edges)).toEqual(['b']);
    expect(upstreamOf('b', edges)).toEqual(['a']);
    expect(downstreamOf('a', edges)).toEqual(['b']);
  });
});

describe('isOnCycle', () => {
  it('is false on a DAG', () => {
    const edges = [e('a', 'c'), e('b', 'c'), e('c', 'd')];
    expect(['a', 'b', 'c', 'd'].some((n) => isOnCycle(n, edges))).toBe(false);
  });

  it('detects a loop through the node', () => {
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('c', 'x')];
    expect(isOnCycle('a', edges)).toBe(true);
    expect(isOnCycle('c', edges)).toBe(true);
    expect(isOnCycle('x', edges)).toBe(false);
  });

  it('counts a two-way flow as a loop for both ends', () => {
    const edges = [e('a', 'b', true), e('b', 'c')];
    expect(isOnCycle('a', edges)).toBe(true);
    expect(isOnCycle('b', edges)).toBe(true);
    expect(isOnCycle('c', edges)).toBe(false);
  });
});

describe('shouldAutoFire', () => {
  it('needs at least one source', () => {
    expect(shouldAutoFire(null, [])).toBe(false);
  });

  it('needs every source published', () => {
    expect(shouldAutoFire(null, [{ latestPublishedAt: d('2026-09-01') }, { latestPublishedAt: null }])).toBe(false);
  });

  it('fires when the target has no version yet and every source is published', () => {
    expect(shouldAutoFire(null, [{ latestPublishedAt: d('2026-09-01') }])).toBe(true);
  });

  it('fires only when every source was published after the target latest version', () => {
    const target = d('2026-09-10T00:00:00Z');
    expect(shouldAutoFire(target, [
      { latestPublishedAt: d('2026-09-11T00:00:00Z') },
      { latestPublishedAt: d('2026-09-12T00:00:00Z') },
    ])).toBe(true);
    expect(shouldAutoFire(target, [
      { latestPublishedAt: d('2026-09-11T00:00:00Z') },
      { latestPublishedAt: d('2026-09-09T00:00:00Z') },
    ])).toBe(false);
    // 같은 시각은 "이후"가 아니다.
    expect(shouldAutoFire(target, [{ latestPublishedAt: target }])).toBe(false);
  });
});
