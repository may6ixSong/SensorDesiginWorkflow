import { Avatar, AvatarGroup, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { IpDto } from '@/types/domain';
import { ArborButton } from '@/components/common/ArborButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface IpHeaderProps {
  ip: IpDto;
  /** 수신 부서 시점 토글 상태 (목업 S.recv) */
  recv: boolean;
  onOpenPermissions: () => void;
  onOpenHld: () => void;
}

/**
 * IP명, 담당자 chip(클릭→권한 dialog), HLD 버튼 (설계서 7.1 컴포넌트 트리).
 * ※ 이 헤더 디자인은 사용자 요청에 따라 기존 형태를 유지한다(목업으로 되돌리지 않음).
 */
export function IpHeader({ ip, recv, onOpenPermissions, onOpenHld }: IpHeaderProps) {
  const repOwner = ip.owners[0];
  const extra = Math.max(0, ip.owners.length - 1 + ip.viewGrants.length);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${T.ln}`, background: T.sf, flex: '0 0 auto' }}
    >
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
      {recv && (
        <Chip label="수신 부서 시점" size="small" variant="outlined"
          sx={{ color: T.vi, borderColor: T.vi3, background: T.vi2 }} />
      )}

      <Tooltip title="담당자 / 권한 관리">
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          onClick={onOpenPermissions}
          sx={{ cursor: 'pointer', px: 1, py: 0.5, borderRadius: 2, '&:hover': { bgcolor: T.sf2 } }}
        >
          <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
            {ip.owners.map((o) => (
              <Avatar key={o.id} sx={{ bgcolor: o.color }}>
                {o.name.slice(1, 2) || o.name.slice(0, 1)}
              </Avatar>
            ))}
          </AvatarGroup>
          <Typography variant="caption">
            {repOwner?.name ?? '담당자 없음'} 외 {extra}명
          </Typography>
        </Stack>
      </Tooltip>

      <ArborButton onClick={onOpenHld}>
        <Icon name="grid" /> HLD Release
      </ArborButton>
    </Stack>
  );
}
