import { MouseEvent, ReactNode, useState } from 'react';
import { Box, Popover } from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { CURSOR_POINTER, T } from '@/theme/tokens';

interface Option {
  value: string;
  label: string;
}

interface NavDropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  disabled?: boolean;
  /** Width of the floating menu (not the trigger button, which sizes to its label). */
  width: number;
  /** Fallback trigger label when nothing matches `value` (e.g. no options at all). */
  placeholder?: string;
}

/**
 * Borderless nav-bar dropdown — trigger shows the current selection, opens a
 * floating menu with the active option highlighted. Replaces the native
 * <select>-based SelectBox for the top bar's Project/IP pickers specifically;
 * SelectBox itself is unchanged and still used elsewhere (Panel, HLD dialog).
 */
export function NavDropdown({ value, onChange, options, disabled, width, placeholder }: NavDropdownProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);
  const selected = options.find((o) => o.value === value);

  const toggle = (e: MouseEvent<HTMLElement>) => {
    if (disabled) return;
    const target = e.currentTarget;
    setAnchor((prev) => (prev ? null : target));
  };
  const close = () => setAnchor(null);

  const handleSelect = (v: string) => {
    onChange(v);
    close();
  };

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <Box
        component="button"
        onClick={toggle}
        disabled={disabled}
        sx={{
          display: 'flex', alignItems: 'center', height: '32px', px: '10px', gap: '4px',
          borderRadius: '4px', border: 'none', outline: 'none',
          background: disabled ? 'transparent' : open ? T.vi2 : 'transparent',
          cursor: disabled ? 'not-allowed' : CURSOR_POINTER, transition: 'background-color .14s',
          '&:hover': disabled ? undefined : { background: open ? T.vi2 : T.sf3 },
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: 13, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap',
            color: disabled ? T.dm2 : open ? T.vi : T.tx,
          }}
        >
          {selected?.label ?? placeholder ?? ''}
        </Box>
        {!disabled && (
          <KeyboardArrowDownRoundedIcon
            sx={{
              fontSize: 18, color: open ? T.vi : T.dm2,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .14s',
            }}
          />
        )}
      </Box>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            mt: '4px', width, py: '4px', borderRadius: '6px', background: T.sf,
            boxShadow: `0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -1px rgba(0,0,0,0.06), 0 0 0 1px ${T.ln}`,
          },
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <DropdownItem key={o.value} label={o.label} active={active} onClick={() => handleSelect(o.value)} />
          );
        })}
      </Popover>
    </Box>
  );
}

function DropdownItem({ label, active, onClick }: { label: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', width: '100%', height: '30px',
        pl: '12px', pr: '8px', textAlign: 'left', fontSize: 13, lineHeight: '16px',
        letterSpacing: '.3px', border: 'none', outline: 'none',
        background: active ? T.vi2 : 'transparent',
        color: active ? T.vi : T.tx, fontWeight: active ? 700 : 400,
        cursor: CURSOR_POINTER, transition: 'background-color .1s',
        '&:hover': { background: active ? T.vi2 : T.sf3 },
      }}
    >
      <Box component="span" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </Box>
    </Box>
  );
}
