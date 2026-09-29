import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from 'react';

interface Options {
  /** 오른쪽 패널이 차지하던 원래 비율(컨테이너 폭 대비) — 이 폭이 최대다. */
  baseFraction: number;
  /** 원래 폭의 하한(px) — 좁은 화면에서도 이 아래로 기본 폭이 줄지 않는다. */
  baseMin: number;
  /** 최소 폭 = 기본(최대) 폭 × 이 값. */
  minRatio: number;
  /** 사용자가 고른 폭을 브라우저에 기억해 둘 키(기본 폭 대비 비율로 저장 — 창 크기가 바뀌어도 맞는다). */
  storageKey?: string;
}

function readRatio(key: string | undefined): number | null {
  if (!key) return null;
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 좌우 분할 화면의 오른쪽 패널 폭을 끌어서 조절한다(사용자 요청). 지금 폭이 최대, 그 절반이 최소다.
 * 폭은 "기본 폭 대비 비율"로 들고 있어서 창 크기가 바뀌어도 같은 비율을 유지한다.
 *
 * 끄는 동안에는 `dragging`이 true다 — 호출부가 화면 전체를 덮는 투명 막을 깔아야 한다. 안 그러면
 * 포인터가 iframe(sheet 편집기) 위로 가는 순간 이벤트가 iframe으로 넘어가 끌기가 끊긴다.
 */
export function useResizableSidePanel(opts: Options) {
  const { baseFraction, baseMin, minRatio, storageKey } = opts;
  // 컨테이너는 화면이 로딩을 마친 뒤에야 생긴다 — ref 객체 대신 콜백 ref로 받아 생기는 순간 잰다.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratio, setRatio] = useState<number>(() => readRatio(storageKey) ?? 1);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!container) return undefined;
    setContainerWidth(container.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const maxWidth = Math.max(baseMin, containerWidth * baseFraction);
  const clampRatio = (r: number) => Math.min(1, Math.max(minRatio, r));
  const width = Math.round(maxWidth * clampRatio(ratio));

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = container;
    if (!el) return;
    e.preventDefault();
    setDragging(true);
    const rect = el.getBoundingClientRect();
    const max = Math.max(baseMin, rect.width * baseFraction);
    let last = ratio;
    const move = (ev: PointerEvent) => {
      last = Math.min(1, Math.max(minRatio, (rect.right - ev.clientX) / max));
      setRatio(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      if (storageKey) {
        try { localStorage.setItem(storageKey, String(last)); } catch { /* 저장 못 해도 동작에는 지장 없다 */ }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [container, baseFraction, baseMin, minRatio, ratio, storageKey]);

  return { containerRef: setContainer, width, dragging, handleProps: { onPointerDown } };
}
