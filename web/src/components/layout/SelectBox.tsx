import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { FONT_MONO, T } from '@/theme/tokens';

/** 목업 .ey — 모노 대문자 라벨 */
export function Eyebrow({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: '.15em',
        textTransform: 'uppercase',
        color: T.dm2,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

interface SelectBoxProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  width?: number | string;
  minWidth?: number | string;
  padLeft?: number;
  children?: ReactNode;
}

/**
 * 목업 .sb — 라벨 + 테두리 없는 native select를 감싼 pill 박스.
 * (MUI Select는 목업의 얇은 인라인 select 룩과 달라서 native select를 그대로 쓴다)
 */
export function SelectBox({
  label, value, onChange, options, disabled, width, minWidth, padLeft, children,
}: SelectBoxProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        padding: '5px 9px',
        pl: padLeft !== undefined ? `${padLeft}px` : '9px',
        borderRadius: '8px',
        background: T.sf2,
        border: `1px solid ${T.ln}`,
        flex: '0 0 auto',
      }}
    >
      {children}
      {label && <Eyebrow>{label}</Eyebrow>}
      <Box
        component="select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        sx={{
          border: 'none',
          background: 'none',
          padding: 0,
          width: width ?? 'auto',
          minWidth,
          fontWeight: 600,
          fontSize: 13,
          boxShadow: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          color: T.tx,
          fontFamily: 'inherit',
          '&:focus': { boxShadow: 'none' },
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Box>
    </Box>
  );
}
