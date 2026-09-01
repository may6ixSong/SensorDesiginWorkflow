import { Box, Tooltip } from '@mui/material';
import { Icon, IconName } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';

interface Props {
  canEdit: boolean;
  edit: boolean;
  onToggleEdit: () => void;
  onCancel: () => void;
  onAdd: () => void;
  onAddReceived: () => void;
  onNote: () => void;
}

/** 목업 .toolbox — 캔버스 좌하단 플로팅 툴박스 */
export function Toolbox({ canEdit, edit, onToggleEdit, onCancel, onAdd, onAddReceived, onNote }: Props) {
  if (!canEdit) return null;
  return (
    <Box
      sx={{
        position: 'absolute', left: 14, bottom: 14, zIndex: 20,
        display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: '6px',
      }}
    >
      <Group>
        <TbBtn
          title={edit ? 'Finish editing' : 'Start layout edit'}
          icon={edit ? 'check' : 'edit'}
          on={edit}
          onClick={onToggleEdit}
        />
      </Group>
      {edit && (
        <>
          <Group>
            <TbBtn title="Cancel changes" icon="undo" danger onClick={onCancel} />
          </Group>
          <Group>
            <TbBtn title="Add deliverable" icon="plus" onClick={onAdd} />
            <TbBtn title="Add artifact I need to receive" icon="inbox" onClick={onAddReceived} />
            <Sep />
            <TbBtn title="Add memo" icon="note" onClick={onNote} />
          </Group>
        </>
      )}
    </Box>
  );
}

const Group = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      display: 'flex', flexDirection: 'row', gap: '4px', background: T.sf,
      border: `1px solid ${T.ln2}`, borderRadius: '11px', padding: '6px', boxShadow: T.sl,
    }}
  >
    {children}
  </Box>
);

const Sep = () => <Box sx={{ width: '1px', background: T.ln, mx: '2px' }} />;

function TbBtn({
  title, icon, on, danger, onClick,
}: {
  title: string; icon: IconName; on?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <Tooltip title={title} placement="top" arrow>
      <Box
        component="button"
        onClick={onClick}
        aria-label={title}
        data-tb={icon}
        sx={{
          width: 36, height: 36, borderRadius: '8px', border: '1px solid transparent',
          background: on ? T.tl2 : 'transparent',
          borderColor: on ? T.tl3 : 'transparent',
          color: on ? T.tl : T.dm,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: CURSOR_POINTER, transition: '.14s', position: 'relative', fontFamily: 'inherit',
          '&:hover': danger
            ? { background: '#fde8e7', color: T.rd }
            : { background: on ? T.tl2 : T.sf2, color: on ? T.tl : T.tx },
        }}
      >
        <Icon name={icon} size={16} />
      </Box>
    </Tooltip>
  );
}
