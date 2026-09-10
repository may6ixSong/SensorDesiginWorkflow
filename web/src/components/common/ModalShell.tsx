import { ReactNode, forwardRef } from 'react';
import { Box, Dialog } from '@mui/material';
import { motion } from 'framer-motion';
import { MOTION, dialogVariants } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { T } from '@/theme/tokens';
import { SirenButton } from './SirenButton';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  width?: number | string;
  header: ReactNode;
  /** 헤더 아래 탭 등 고정 영역 */
  belowHeader?: ReactNode;
  children: ReactNode;
  /** 본문 스크롤과 무관하게 하단에 고정되는 영역(예: 삭제 버튼). */
  footer?: ReactNode;
}

/**
 * 모든 다이얼로그의 껍데기. 헤더는 밝은 표면, 본문은 한 단계 낮은 표면에 스크롤.
 *
 * ★ 등장/퇴장 전환을 **여기 한 곳에서** 준다(설계서 06장 §1.4) — 다이얼로그마다 따로
 *   붙이면 리듬이 어긋난다. scale 0.96에서 올라오며 안착하는 spring이고,
 *   prefers-reduced-motion이면 전환이 사라진다.
 */
export function ModalShell({ open, onClose, width = 640, header, belowHeader, children, footer }: Props) {
  const m = useMotion();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      // MUI의 기본 Grow 대신 framer-motion spring을 쓴다 — 앱 전체가 같은 전환 토큰을
      // 공유해야 "같은 물성"으로 읽힌다.
      TransitionComponent={MotionPaperTransition as never}
      TransitionProps={{ motionTransition: m(MOTION.panel) } as never}
      PaperProps={{
        sx: {
          width,
          maxWidth: '96vw',
          maxHeight: '90vh',
          background: T.sf,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          m: 2,
        },
      }}
    >
      <Box sx={{ padding: '15px 20px 0', flex: '0 0 auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{header}</Box>
          <SirenButton variant="ghost" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </SirenButton>
        </Box>
        {belowHeader}
      </Box>
      <Box sx={{ padding: '15px 20px 20px', overflowY: 'auto', background: T.sf2, flex: 1 }}>
        {children}
      </Box>
      {footer && (
        <Box sx={{ padding: '12px 20px', borderTop: `1px solid ${T.ln}`, background: T.sf, flex: '0 0 auto' }}>
          {footer}
        </Box>
      )}
    </Dialog>
  );
}

/**
 * MUI Dialog의 Transition 슬롯에 끼우는 framer-motion 어댑터.
 *
 * MUI는 `in`/`onExited`로 마운트를 통제하므로 AnimatePresence 대신 그 신호를 그대로
 * variants에 연결한다 — 그래야 닫힘 애니메이션이 끝난 뒤에 언마운트된다.
 */
const MotionPaperTransition = forwardRef<
  HTMLDivElement,
  // MUI의 TransitionProps는 여기서 쓰지 않는 필드가 많아 필요한 것만 좁혀 받는다.
  { in?: boolean; children?: ReactNode; onExited?: (node?: HTMLElement) => void; motionTransition?: object }
>(function MotionPaperTransition({ in: inProp, children, onExited, motionTransition }, ref) {
  return (
    <motion.div
      ref={ref}
      variants={dialogVariants}
      initial="hidden"
      animate={inProp ? 'visible' : 'exit'}
      transition={motionTransition ?? MOTION.panel}
      onAnimationComplete={(d) => { if (d === 'exit') onExited?.(); }}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, outline: 'none' }}
    >
      {children}
    </motion.div>
  );
});
