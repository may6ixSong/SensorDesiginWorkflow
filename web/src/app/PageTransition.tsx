import { ReactNode, useRef } from 'react';
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
  if (seg[0] === 'projects') return seg.length >= 3 ? 3 : seg.length >= 2 ? 2 : 1;
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
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const m = useMotion();
  const prevDepth = useRef(depthOf(location.pathname));

  const depth = depthOf(location.pathname);
  const direction = depth > prevDepth.current ? 1 : depth < prevDepth.current ? -1 : 0;
  prevDepth.current = depth;

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
