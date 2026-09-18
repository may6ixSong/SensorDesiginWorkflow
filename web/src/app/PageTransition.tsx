import { ReactNode, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION, pageVariants } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';

/**
 * 라우트 깊이 — 이 순서가 곧 전환 방향이다(설계서 06장 §1.4.1).
 *
 * 더 안으로 들어가면(forward) 새 화면이 오른쪽에서 들어오고, 밖으로 나오면(back)
 * 반대로 움직인다. 같은 깊이의 형제 전환(workflow A → B)은 방향 없이 fade만 한다.
 *
 * ★ 실제 라우트가 늘어나면 여기 한 곳만 고친다 — 화면마다 다른 전환을 만들지 않는다.
 */
function depthOf(pathname: string): number {
  const seg = pathname.split('/').filter(Boolean);
  if (seg.length === 0) return 0;                      // 대문
  if (seg[0] === 'guide' || seg[0] === 'no-access') return 1;
  if (seg[0] === 'service-manage') return 1;
  // /projects/:id(2) → /projects/:id/artifacts(3) → /projects/:id/artifacts/:artifactId(4).
  // ★ 예전에는 `seg.length >= 3 ? 3`이어서 목록과 상세가 **같은 깊이(3)** 로 잡혔다 —
  //   그래서 목록→상세가 방향 없는 형제 전환(direction 0)이 되어 슬라이드도 안 나오고,
  //   enter/exit 목표값이 center와 opacity만 다른 상태로 겹쳐 전환이 취약했다.
  if (seg[0] === 'projects') {
    if (seg.length >= 4) return 4;
    return seg.length >= 3 ? 3 : seg.length >= 2 ? 2 : 1;
  }
  // /details/:projectId/:workflowId 가 가장 깊다 — 캔버스가 최종 목적지다.
  if (seg[0] === 'details') return seg.length >= 3 ? 4 : 2;
  if (seg[0] === 'artifacts') return 4;
  return 2;
}

/**
 * 페이지 전환.
 *
 * 실제 3D 종이 넘김까지는 만들지 않는다 — **방향이 있는 슬라이드 + fade**만으로 "책장을
 * 넘기는" 감각은 충분히 나고, 과한 효과는 오히려 반응성을 해친다(전환 200ms 내외).
 */
/**
 * ⚠️ 임시 진단 스위치 (원인 이분탐색용, 확인 후 false로 되돌릴 것).
 *
 * true  = 페이지 전환 애니메이션을 통째로 건너뛰고 children을 그대로 렌더한다.
 * false = 원래 동작(AnimatePresence 전환).
 *
 * "artifact 목록 → 상세로 이동하면 DOM은 다 있는데 화면만 백지, 새로고침하면 정상"
 * 증상이 이 스위치를 true로 두었을 때 사라지는지로 원인 범위를 가른다:
 *   사라진다  → PageTransition/AnimatePresence 계열이 원인
 *   그대로다  → 전환과 무관 (다른 곳을 봐야 한다)
 */
const DISABLE_PAGE_TRANSITION = true;

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const m = useMotion();

  const depth = depthOf(location.pathname);
  const prevDepth = useRef(depth);
  const direction = depth > prevDepth.current ? 1 : depth < prevDepth.current ? -1 : 0;

  // ★ 렌더 중에 ref를 쓰면 안 된다 — StrictMode(main.tsx)는 dev에서 렌더를 두 번 돌리므로,
  //   두 번째 렌더는 이미 덮어써진 값으로 direction을 계산해 매번 0이 나올 수 있었다.
  //   커밋된 뒤에만 갱신해서 direction이 렌더 간에 안정되게 한다.
  useEffect(() => {
    prevDepth.current = depth;
  }, [depth]);

  // 진단 스위치 — 위 상수 주석 참고. 훅은 위에서 이미 다 호출했으므로 순서가 깨지지 않는다.
  if (DISABLE_PAGE_TRANSITION) {
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={pageVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={m(MOTION.fade)}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
