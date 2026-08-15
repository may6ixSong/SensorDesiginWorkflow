import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { FONT_MONO, T } from '@/theme/tokens';

/** 목업 .card */
export function Card({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '10px', padding: '13px', ...sx }}>
      {children}
    </Box>
  );
}

/** 목업 .ey (모달 내부용) */
export function Ey({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em',
        textTransform: 'uppercase', color: T.dm2, ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** 목업 .fld */
export function Field({ label, children, sx }: { label?: string; children: ReactNode; sx?: object }) {
  return (
    <Box sx={{ mb: '11px', ...sx }}>
      {label && (
        <Box component="label" sx={{ display: 'block', fontSize: 11, color: T.dm, mb: '5px', fontWeight: 500 }}>
          {label}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** 목업 .row */
export function Row({ children, sx }: { children: ReactNode; sx?: object }) {
  return <Box sx={{ display: 'flex', gap: '9px', ...sx }}>{children}</Box>;
}

const controlSx = {
  fontFamily: 'inherit',
  fontSize: 13,
  background: T.sf,
  color: T.tx,
  border: `1px solid ${T.ln2}`,
  borderRadius: '7px',
  padding: '8px 10px',
  width: '100%',
  outline: 'none',
  userSelect: 'text',
  '&:focus': { borderColor: T.tl, boxShadow: `0 0 0 3px ${T.tl2}` },
};

export function TextInput({
  value, onChange, placeholder, error, id,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean; id?: string;
}) {
  return (
    <Box
      component="input"
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      sx={{ ...controlSx, ...(error ? { borderColor: T.rd } : {}) }}
    />
  );
}

export function TextArea({
  value, onChange, rows = 4,
}: {
  value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <Box
      component="textarea"
      rows={rows}
      value={value}
      onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      sx={{ ...controlSx, resize: 'vertical' }}
    />
  );
}

export function SelectInput({
  value, onChange, options, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Box
      component="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      sx={{ ...controlSx, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Box>
  );
}
