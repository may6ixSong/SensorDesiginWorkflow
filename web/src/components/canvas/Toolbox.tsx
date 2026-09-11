import { Box, Tooltip } from '@mui/material';
import { Icon, IconName } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';

interface Props {
  canEdit: boolean;
  edit: boolean;
  onToggleEdit: () => void;
  onCancel: () => void;
  onAdd: () => void;
  onNote: () => void;
}

/** 목업 .toolbox — 캔버스 좌하단 플로팅 툴박스 */
export function Toolbox({ canEdit, edit, onToggleEdit, onCancel, onAdd, onNote }: Props) {
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
            {/* 예전엔 "주는 산출물"/"받는 산출물" 버튼이 따로 있었는데, 후자는 실제로
                받는 산출물을 만드는 기능으로 이어지지 않았다(intent는 서버가 항상
                'own'으로 고정) — 사용자 요청으로 하나로 합쳤다. 자세한 재설계는 이후
                별도로 진행한다. */}
            <TbBtn title="Add block" icon="inbox" onClick={onAdd} />
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
      border: `1px solid ${T.ln2}`, borderRadius: '11px', padding: '6px', boxShadow: T.shLg,
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
          background: on ? T.prSoft : 'transparent',
          borderColor: on ? T.prLine : 'transparent',
          color: on ? T.pr : T.dm,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: CURSOR_POINTER, transition: '.14s', position: 'relative', fontFamily: 'inherit',
          '&:hover': danger
            ? { background: '#fde8e7', color: T.danger }
            : { background: on ? T.prSoft : T.sf2, color: on ? T.pr : T.tx },
        }}
      >
        <Icon name={icon} size={16} />
      </Box>
    </Tooltip>
  );
}
