import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { Icon, IconName } from './Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';

interface Props {
  icon: IconName;
  label: string;
  /** Renders as a router link instead of a button. */
  to?: string;
  onClick?: () => void;
  active?: boolean;
}

/**
 * Borderless 32px icon button used for the cluster of controls on the right of
 * the top bar (user guide / language / theme). Shared so they stay identical as
 * more get added.
 */
export function HeaderIconButton({ icon, label, to, onClick, active = false }: Props) {
  const sx = {
    display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '8px',
    background: active ? T.sf3 : T.sf,
    color: active ? T.tx : T.dm,
    border: 'none', outline: 'none', cursor: CURSOR_POINTER,
    transition: '.14s', flex: '0 0 auto', textDecoration: 'none',
    '&:hover': { background: T.sf3, color: T.tx },
  } as const;

  if (to) {
    return (
      <Box component={Link} to={to} aria-label={label} title={label} sx={sx}>
        <Icon name={icon} size={15} />
      </Box>
    );
  }
  return (
    <Box component="button" onClick={onClick} aria-label={label} title={label} sx={sx}>
      <Icon name={icon} size={15} />
    </Box>
  );
}
