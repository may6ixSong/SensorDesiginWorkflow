import { Avatar, AvatarGroup, Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { IpDto } from '@/types/domain';
import { tokens } from '@/theme/theme';

interface IpHeaderProps {
  ip: IpDto;
  onOpenPermissions: () => void;
  onOpenHld: () => void;
}

/** IP명, 담당자 chip(클릭→권한 dialog), HLD 버튼 (설계서 7.1 컴포넌트 트리). */
export function IpHeader({ ip, onOpenPermissions, onOpenHld }: IpHeaderProps) {
  const repOwner = ip.owners[0];

  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.border}` }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ip.color, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {ip.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {ip.description}
        </Typography>
      </Box>

      <Chip
        label={ip.myAccess === 'edit' ? 'Edit 권한' : 'View 권한'}
        size="small"
        color={ip.myAccess === 'edit' ? 'primary' : 'default'}
        variant="outlined"
      />

      <Tooltip title="담당자 / 권한 관리">
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          onClick={onOpenPermissions}
          sx={{ cursor: 'pointer', px: 1, py: 0.5, borderRadius: 2, '&:hover': { bgcolor: tokens.surfaceAlt } }}
        >
          <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
            {ip.owners.map((o) => (
              <Avatar key={o.id}>{o.name.slice(0, 1)}</Avatar>
            ))}
          </AvatarGroup>
          <Typography variant="caption">{repOwner?.name ?? '담당자 없음'} 외 {Math.max(0, ip.owners.length - 1)}</Typography>
        </Stack>
      </Tooltip>

      <Button size="small" variant="outlined" startIcon={<HistoryOutlinedIcon />} onClick={onOpenHld}>
        HLD
      </Button>
    </Stack>
  );
}
