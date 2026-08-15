import { useRef } from 'react';
import { Layout } from '@/types/domain';
import { LaneGeom, laneForX } from '@/lib/laneGeometry';
import { GRID, PHASE_WALL_RESISTANCE_PX } from '@/lib/layoutConstants';

interface UseBlockDragOptions {
  layout: Layout;
  phaseKey: string;
  lanes: LaneGeom[];
  zoom: number;
  enabled: boolean;
  onCommit: (layout: Layout, phaseKey: string) => void;
  onBoundaryFlash?: (laneKey: string) => void;
}

interface DragSession {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  lockedLaneKey: string;
  accX: number;
  lastAttemptDir: 1 | -1 | 0;
  curX: number;
  curY: number;
}

/**
 * 산출물/메모 블록의 자유 드래그 (설계서 3.7, 7.1).
 * - pointerdown/move/up + setPointerCapture, HTML5 DnD API 사용 안 함.
 * - 드래그 중 DOM style.left/top 직접 조작, pointerup에서 상태 커밋 1회.
 * - Phase 벽 저항: 누적 이동량(accX)이 드래그 세션 동안 추적되고, 50px를 넘어야 경계를 넘는다.
 * - 드래그 종료 시 x좌표가 속한 Phase 레인으로 phaseKey가 자동 갱신된다.
 */
export function useBlockDrag({ layout, phaseKey, lanes, zoom, enabled, onCommit, onBoundaryFlash }: UseBlockDragOptions) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const session = useRef<DragSession | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const lockedLane = laneForX(lanes, layout.x + layout.w / 2);
    session.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: layout.x,
      startY: layout.y,
      lockedLaneKey: lockedLane?.key ?? phaseKey,
      accX: 0,
      lastAttemptDir: 0,
      curX: layout.x,
      curY: layout.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = session.current;
    if (!s) return;

    const dxLocal = (e.clientX - s.startClientX) / zoom;
    const dyLocal = e.clientY - s.startClientY;
    const prevX = s.curX;
    let nextX = Math.max(0, s.startX + dxLocal);
    const nextY = Math.max(0, s.startY + dyLocal);

    const lockedLane = lanes.find((l) => l.key === s.lockedLaneKey);
    if (lockedLane) {
      const centerX = nextX + layout.w / 2;
      const withinLocked = centerX >= lockedLane.x && centerX < lockedLane.x + lockedLane.width;
      if (!withinLocked) {
        const dir: 1 | -1 = centerX < lockedLane.x ? -1 : 1;
        if (s.lastAttemptDir !== dir) {
          s.accX = 0;
          s.lastAttemptDir = dir;
        }
        s.accX += Math.abs(nextX - prevX);

        if (s.accX >= PHASE_WALL_RESISTANCE_PX) {
          const newLane = laneForX(lanes, centerX);
          if (newLane && newLane.key !== s.lockedLaneKey) {
            onBoundaryFlash?.(dir === 1 ? lockedLane.key : newLane.key);
            s.lockedLaneKey = newLane.key;
            s.accX = 0;
          }
        } else {
          // 경계를 넘기 전까지는 살짝 걸치는 정도로만 허용(고무줄처럼 튕겨 돌아오는 느낌)
          const clampMin = lockedLane.x - layout.w / 2 + 1;
          const clampMax = lockedLane.x + lockedLane.width - layout.w / 2 - 1;
          nextX = Math.min(Math.max(nextX, clampMin), clampMax);
        }
      } else {
        s.accX = 0;
        s.lastAttemptDir = 0;
      }
    }

    s.curX = nextX;
    s.curY = nextY;
    if (elRef.current) {
      elRef.current.style.left = `${nextX}px`;
      elRef.current.style.top = `${nextY}px`;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = session.current;
    if (!s) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // 이미 해제된 경우 무시
    }
    const snappedX = Math.round(s.curX / GRID) * GRID;
    const snappedY = Math.max(0, Math.round(s.curY / GRID) * GRID);
    const centerX = snappedX + layout.w / 2;
    const finalLane = laneForX(lanes, centerX);
    session.current = null;
    onCommit({ x: snappedX, y: snappedY, w: layout.w, h: layout.h }, finalLane?.key ?? phaseKey);
  };

  return { elRef, onPointerDown, onPointerMove, onPointerUp };
}
