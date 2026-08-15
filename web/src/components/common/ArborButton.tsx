import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Box } from '@mui/material';
import { T } from '@/theme/tokens';

type Variant = 'default' | 'on' | 'primary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
  sx?: object;
}

/** 목업 .btn / .btn.on / .btn.pr / .btn.gh */
export const ArborButton = forwardRef<HTMLButtonElement, Props>(function ArborButton(
  { variant = 'default', children, sx, ...rest },
  ref,
) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: 12.5,
    fontWeight: 500,
    padding: '6px 11px',
    borderRadius: '7px',
    transition: '.14s',
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
  } as const;

  const styles: Record<Variant, object> = {
    default: {
      background: T.sf,
      border: `1px solid ${T.ln2}`,
      color: T.tx,
      boxShadow: T.ss,
      '&:hover:not(:disabled)': { background: T.sf3 },
    },
    on: {
      background: T.tl2,
      border: `1px solid ${T.tl3}`,
      color: T.tl,
      boxShadow: T.ss,
      '&:hover:not(:disabled)': { background: T.tl2 },
    },
    primary: {
      background: T.tl,
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: T.ss,
      '&:hover:not(:disabled)': { background: '#0bab90' },
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
    <Box component="button" ref={ref} sx={{ ...base, ...styles[variant], ...sx }} {...rest}>
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
    s: { background: T.tl2, borderColor: T.tl3, color: T.tl },
    v: { background: T.vi2, borderColor: T.vi3, color: T.vi },
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
        cursor: onClick ? 'pointer' : 'default',
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
