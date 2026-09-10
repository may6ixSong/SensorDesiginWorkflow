import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Box } from '@mui/material';
import { motion } from 'framer-motion';
import { MOTION } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { CURSOR_POINTER, FOCUS_RING, R, T } from '@/theme/tokens';

type Variant = 'default' | 'on' | 'primary' | 'ghost';

/**
 * framer-motion이 같은 이름의 prop을 다른 시그니처로 쓰기 때문에(React는 DOM 이벤트,
 * motion은 애니메이션 콜백) 그 넷은 제외한다 — 이 버튼에서는 어차피 쓰지 않는다.
 */
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDragStart' | 'onDrag' | 'onDragEnd'
>;

interface Props extends NativeButtonProps {
  variant?: Variant;
  children?: ReactNode;
  sx?: object;
}

/**
 * 앱 전체가 쓰는 버튼.
 *
 * ★ 눌림 피드백을 여기서 한 번에 준다(설계서 06장 §1.4) — 짧고 탄력 있는 spring으로
 *   살짝 줄어든다. 버튼마다 따로 붙이면 세기가 제각각이 된다.
 */
export const SirenButton = forwardRef<HTMLButtonElement, Props>(function SirenButton(
  { variant = 'default', children, sx, ...rest },
  ref,
) {
  const m = useMotion();
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: 12.5,
    fontWeight: 500,
    padding: '6px 11px',
    borderRadius: `${R.sm}px`,
    transition: 'background .14s, border-color .14s, color .14s',
    fontFamily: 'inherit',
    cursor: CURSOR_POINTER,
    whiteSpace: 'nowrap',
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
    '&:focus-visible': FOCUS_RING,
  } as const;

  const styles: Record<Variant, object> = {
    default: {
      background: T.sf,
      border: `1px solid ${T.ln2}`,
      color: T.tx,
      boxShadow: T.shXs,
      '&:hover:not(:disabled)': { background: T.sf3 },
    },
    on: {
      background: T.prSoft,
      border: `1px solid ${T.prLine}`,
      color: T.pr,
      boxShadow: T.shXs,
      '&:hover:not(:disabled)': { background: T.prSoft },
    },
    primary: {
      background: T.pr,
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: T.shXs,
      '&:hover:not(:disabled)': { background: T.prHover },
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: T.tx,
      boxShadow: 'none',
      '&:hover:not(:disabled)': { background: T.sf3 },
    },
  };

  return (
    <Box
      component={motion.button}
      ref={ref}
      // 눌렀을 때만 반응한다 — hover에서 움직이면 목록 위에서 산만해진다.
      whileTap={rest.disabled ? undefined : { scale: 0.97 }}
      transition={m(MOTION.press)}
      sx={{ ...base, ...styles[variant], ...sx }}
      {...rest}
    >
      {children}
    </Box>
  );
});

/** 목업 .chip / .chip.s / .chip.v */
export function Chip({
  tone = 'default',
  children,
  onClick,
  sx,
}: {
  tone?: 'default' | 's' | 'v';
  children: ReactNode;
  onClick?: () => void;
  sx?: object;
}) {
  const tones = {
    default: { background: T.sf2, borderColor: T.ln, color: T.dm },
    s: { background: T.prSoft, borderColor: T.prLine, color: T.pr },
    v: { background: T.prSoft, borderColor: T.prLine, color: T.pr },
  }[tone];
  return (
    <Box
      component={onClick ? 'button' : 'span'}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: '6px',
        border: '1px solid',
        fontFamily: 'inherit',
        cursor: onClick ? CURSOR_POINTER : 'default',
        ...tones,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** 목업 .bdg — 작은 상태 배지 */
export function Badge({
  color, bg, borderColor, children, sx,
}: {
  color: string; bg: string; borderColor: string; children: ReactNode; sx?: object;
}) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 8,
        fontFamily: "'IBM Plex Mono',monospace",
        padding: '1px 4px',
        borderRadius: '5px',
        border: '1px solid',
        color,
        background: bg,
        borderColor,
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
