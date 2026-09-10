/**
 * 모션 토큰 (설계서 06장 §1).
 *
 * 목표는 "접히고 펼쳐지는 기기의 화면 전환" 같은 관성이 살아 있는 움직임이다.
 * 그래서 위치·크기가 움직이는 것에는 **spring**을, 색·투명도처럼 물리감이 필요 없는
 * 것에는 **tween**을 쓴다.
 *
 * ★ 컴포넌트마다 duration·easing을 직접 쓰지 않는다. 전부 여기를 참조한다 —
 *   그래야 나중에 전체 리듬을 한 번에 조율할 수 있다.
 */
import type { Transition, Variants } from 'framer-motion';

export const MOTION = {
  /** 다이얼로그·슬라이드 패널. 살짝 무겁게 잡아 "묵직하게 안착"하는 느낌을 준다. */
  panel: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as Transition,
  /** 캔버스 블록의 layout 변화. 패널보다 가볍고 빠르다. */
  block: { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as Transition,
  /** 버튼 눌림 — 아주 짧고 탄력 있게. */
  press: { type: 'spring', stiffness: 700, damping: 30 } as Transition,
  /** 목록 정렬·필터 변화처럼 여러 항목이 동시에 움직일 때. */
  list: { type: 'spring', stiffness: 460, damping: 40, mass: 0.7 } as Transition,

  /** 색·투명도. */
  fade: { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] } as Transition,
  /** 캔버스 배경 전환처럼 넓은 면적이 바뀔 때 — 조금 느리게 가야 눈이 편하다. */
  surface: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] } as Transition,
} as const;

/** prefers-reduced-motion 사용자에게 주는 대체값 — 전환을 사실상 없앤다. */
export const REDUCED: Transition = { duration: 0 };

/* ------------------------------------------------------------------ *
 * 공용 variants
 * ------------------------------------------------------------------ */

/** 다이얼로그 — scale로 "다가오는" 느낌을 주되 과하지 않게 0.96에서 시작한다. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 4 },
};

/** 오른쪽에서 들어오는 슬라이드 패널(산출물 상세 등). */
export const slideOverVariants: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
};

/** 토스트 — 아래에서 올라온다. */
export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
};

/**
 * 페이지 전환 (설계서 06장 §1.4.1).
 *
 * 방향이 있는 전환이다 — 더 안으로 들어가면(forward) 새 화면이 오른쪽에서 들어오고,
 * 밖으로 나오면(back) 반대다. 같은 깊이의 형제 전환은 방향 없이 fade만 한다.
 * `custom`으로 direction(1 | 0 | -1)을 받는다.
 */
export const pageVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d === 0 ? 0 : d * 26 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d === 0 ? 0 : d * -26 }),
};

/**
 * 목록이 처음 그려질 때 항목을 차례로 세우는 stagger.
 * 항목이 많으면 전체가 늘어지므로 간격을 아주 짧게 잡고, 앞쪽 몇 개에만 체감되게 한다.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};
