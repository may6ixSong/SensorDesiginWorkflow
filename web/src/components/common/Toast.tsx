import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '@/store/toastStore';
import { MOTION, toastVariants } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { R, T } from '@/theme/tokens';

/**
 * 하단 중앙 토스트 — 1.9초 후 사라진다.
 *
 * 아래에서 올라오며 안착하고(spring), 사라질 때는 짧게 fade한다 — 등장은 눈에 띄어야
 * 하지만 퇴장은 시선을 끌면 안 된다(설계서 06장 §1.4).
 */
export function Toast() {
  const msg = useToastStore((s) => s.msg);
  const seq = useToastStore((s) => s.seq);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!msg) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1900);
    return () => clearTimeout(t);
  }, [msg, seq]);

  const m = useMotion();

  return (
    <AnimatePresence>
      {visible && msg && (
        <Box
          component={motion.div}
          key={seq}
          variants={toastVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={m(MOTION.panel)}
          sx={{
            position: 'fixed',
            left: '50%',
            bottom: 22,
            // framer-motion이 transform을 관리하므로 가운데 정렬은 x로 준다.
            x: '-50%',
            background: T.inv,
            color: T.invTx,
            fontSize: 12.5,
            fontWeight: 500,
            px: '15px',
            py: '8px',
            borderRadius: `${R.sm}px`,
            boxShadow: T.shLg,
            zIndex: 1600,
            pointerEvents: 'none',
          }}
        >
          {msg}
        </Box>
      )}
    </AnimatePresence>
  );
}
