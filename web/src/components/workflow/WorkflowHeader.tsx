import { Avatar, AvatarGroup, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { WorkflowDto } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';
import { initials } from '@/components/common/Avatar';
import { findDirectoryUser } from '@/shared/constants/mock-users';
import { canEditWorkflow } from '@/lib/access';

interface WorkflowHeaderProps {
  workflow: WorkflowDto;
  /** 수신 부서 시점 토글 상태 (목업 S.recv) */
  recv: boolean;
  /** 이 workflow에서 일정을 잃은 산출물 수 — 0보다 크면 헤더에 경고 chip이 붙는다. */
  orphanCount: number;
  onOpenPermissions: () => void;
  onOpenHld: () => void;
  /** 일정(phase) 편집 — Edit 권한자에게만 뜬다. */
  onEditPhases?: () => void;
}

/**
 * workflow명, 담당자 chip(클릭→권한 dialog), 일정 편집 · HLD 버튼.
 *
 * 일정 편집이 여기 붙는 이유: phase는 이제 workflow가 소유한 데이터라 과제 화면이 아니라
 * 이 workflow의 보드가 제자리다(과제 화면에서 고치는 것은 공통 마일스톤뿐이다).
 */
export function WorkflowHeader({
  workflow, recv, orphanCount, onOpenPermissions, onOpenHld, onEditPhases,
}: WorkflowHeaderProps) {
  const repOwner = workflow.owners.length ? findDirectoryUser(workflow.owners[0]) : null;
  const extra = Math.max(0, workflow.owners.length - 1 + workflow.viewGrants.length);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${T.ln}`, background: T.sf, flex: '0 0 auto' }}
    >
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: workflow.color, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {workflow.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {workflow.description}
        </Typography>
      </Box>

      <Chip
        label={canEditWorkflow(workflow) ? 'Edit access' : 'View access'}
        size="small"
        color={canEditWorkflow(workflow) ? 'primary' : 'default'}
        variant="outlined"
      />
      {recv && (
        <Chip label="Recipient-dept view" size="small" variant="outlined"
          sx={{ color: T.vi, borderColor: T.vi3, background: T.vi2 }} />
      )}

      <Tooltip title="Manage owners / permissions">
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          onClick={onOpenPermissions}
          sx={{ cursor: CURSOR_POINTER, px: 1, py: 0.5, borderRadius: 2, '&:hover': { bgcolor: T.sf2 } }}
        >
          <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
            {workflow.owners.map((knoxId) => {
              const o = findDirectoryUser(knoxId);
              return (
                <Avatar key={knoxId} sx={{ bgcolor: o.color }}>
                  {initials(o.name)}
                </Avatar>
              );
            })}
          </AvatarGroup>
          <Typography variant="caption">
            {repOwner?.name ?? 'No owner'} +{extra} more
          </Typography>
        </Stack>
      </Tooltip>

      {orphanCount > 0 && (
        <Chip
          icon={<Box sx={{ display: 'flex', ml: '6px' }}><Icon name="warn" size={12} /></Box>}
          label={`${orphanCount} without schedule`}
          size="small"
          variant="outlined"
          title="Artifacts whose phase was removed from this workflow's schedule"
          sx={{ color: T.rd, borderColor: T.rd3, background: T.rd2 }}
        />
      )}

      {onEditPhases && (
        <SirenButton onClick={onEditPhases}>
          <Icon name="calendar" /> Edit phases
        </SirenButton>
      )}

      <SirenButton onClick={onOpenHld}>
        <Icon name="grid" /> HLD Release
      </SirenButton>
    </Stack>
  );
}
