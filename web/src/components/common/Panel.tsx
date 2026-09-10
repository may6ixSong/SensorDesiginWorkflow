import { KeyboardEvent, ReactNode } from 'react';
import { Box } from '@mui/material';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

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
  '&:focus': { borderColor: T.pr, boxShadow: `0 0 0 3px ${T.prSoft}` },
};

export function TextInput({
  value, onChange, placeholder, error, id, onKeyDown, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  id?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  return (
    <Box
      component="input"
      id={id}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      onKeyDown={onKeyDown}
      sx={{ ...controlSx, ...(error ? { borderColor: T.danger } : {}) }}
    />
  );
}

export function DateInput({
  value, onChange, error, id,
}: {
  value: string; onChange: (v: string) => void; error?: boolean; id?: string;
}) {
  return (
    <Box
      component="input"
      type="date"
      id={id}
      value={value}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      sx={{ ...controlSx, ...(error ? { borderColor: T.danger } : {}) }}
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
  /**
   * option마다 disabled를 줄 수 있다 — 지금 선택된 값이 후보 목록에 없을 때 그 값을
   * "선택된 채로 고를 수는 없는" 항목으로 끼워 보여주는 데 쓴다(설계서 01장 §3.5).
   */
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <Box
      component="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      sx={{
        ...controlSx,
        cursor: disabled ? 'not-allowed' : CURSOR_POINTER,
        // 네이티브 화살표는 OS마다 굵기/색이 달라 나머지 컨트롤과 따로 논다 —
        // 지우고 같은 선 색(T.dm2)의 chevron을 배경으로 직접 그린다.
        appearance: 'none',
        paddingRight: '30px',
        // data URI 안에서는 CSS 변수가 풀리지 않으므로 색을 직접 박는다 —
        // 라이트/다크 어느 쪽 배경에서도 같은 대비로 읽히는 중간 회색을 골랐다.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888e9c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 11px center',
        backgroundSize: '10px 6px',
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color .16s ease, box-shadow .16s ease',
        '&:hover:not(:disabled)': { borderColor: T.ln3 },
        // See SelectBox — the native popup keeps its default light background even
        // under color-scheme:dark, so options need an explicit background to pair
        // with the inherited text color.
        '& option': { background: T.sf, color: T.tx },
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </Box>
  );
}
