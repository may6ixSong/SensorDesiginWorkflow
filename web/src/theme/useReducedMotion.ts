import { useEffect, useState } from 'react';
import type { Transition } from 'framer-motion';
import { REDUCED } from './motion';

/**
 * `prefers-reduced-motion: reduce`를 존중한다 (설계서 06장 §1.5).
 *
 * framer-motion에도 자체 훅이 있지만, 여기서 한 번 감싸 두면 호출부가 항상
 * `m(MOTION.panel)` 한 가지 형태로 쓰게 되어 빠뜨리는 자리가 안 생긴다.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * 전환값을 상황에 맞게 골라 준다.
 *
 *   const m = useMotion();
 *   <motion.div transition={m(MOTION.panel)} />
 */
export function useMotion(): (t: Transition) => Transition {
  const reduced = usePrefersReducedMotion();
  return (t: Transition) => (reduced ? REDUCED : t);
}
