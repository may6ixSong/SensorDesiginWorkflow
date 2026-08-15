import { Layout } from '@/types/domain';

export interface Point {
  x: number;
  y: number;
}

/**
 * 직교(수직/수평) 라우팅만 사용, 곡선 없음 (설계서 3.9).
 * 두 블록의 상대 위치에 따라 좌/우 변 또는 상/하 변에서 나가고 들어오는
 * 3-세그먼트(꺾임 1회) 경로를 만든다.
 */
export function computeOrthPath(from: Layout, to: Layout): Point[] {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const fromRight = from.x + from.w;
  const toRight = to.x + to.w;

  const horizontallyDisjoint = fromRight <= to.x || toRight <= from.x;

  if (horizontallyDisjoint) {
    const goingRight = to.x >= fromRight;
    const startX = goingRight ? fromRight : from.x;
    const endX = goingRight ? to.x : toRight;
    const startY = fromCenter.y;
    const endY = toCenter.y;
    const midX = (startX + endX) / 2;
    return [
      { x: startX, y: startY },
      { x: midX, y: startY },
      { x: midX, y: endY },
      { x: endX, y: endY },
    ];
  }

  const goingDown = to.y >= from.y + from.h;
  const startY = goingDown ? from.y + from.h : from.y;
  const endY = goingDown ? to.y : to.y + to.h;
  const startX = fromCenter.x;
  const endX = toCenter.x;
  const midY = (startY + endY) / 2;
  return [
    { x: startX, y: startY },
    { x: startX, y: midY },
    { x: endX, y: midY },
    { x: endX, y: endY },
  ];
}

export function pathToSvgD(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** 선 중앙 세그먼트의 중점 - 양방향 순환(refresh) 아이콘 배치용 (설계서 3.9). */
export function pathMidpoint(points: Point[]): Point {
  const midIdx = Math.floor((points.length - 1) / 2);
  const a = points[midIdx];
  const b = points[midIdx + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
