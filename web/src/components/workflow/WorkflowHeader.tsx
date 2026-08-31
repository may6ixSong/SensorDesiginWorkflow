import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowDto } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

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

/** Edit phases / Owners & permissions 아이콘 버튼 크기 — 기존 권한 dialog 버튼(shield, 13px)의 2배. */
const ICON_BUTTON_SIZE = 26;

/**
 * workflow명, 일정 편집 · 권한 관리 아이콘 버튼(모두 왼쪽 정렬, workflow명 옆), HLD 버튼.
 *
 * 일정 편집이 여기 붙는 이유: phase는 이제 workflow가 소유한 데이터라 과제 화면이 아니라
 * 이 workflow의 보드가 제자리다(과제 화면에서 고치는 것은 공통 마일스톤뿐이다).
 */
export function WorkflowHeader({
  workflow, recv, orphanCount, onOpenPermissions, onOpenHld, onEditPhases,
}: WorkflowHeaderProps) {
  const { t } = useTranslation();

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${T.ln}`, background: T.sf, flex: '0 0 auto' }}
    >
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: workflow.color, flexShrink: 0 }} />

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ minWidth: 0, mr: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {workflow.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {workflow.description}
          </Typography>
        </Box>

        {onEditPhases && (
          <Tooltip title={t('workflow.editPhases')}>
            <SirenButton variant="ghost" onClick={onEditPhases} sx={{ padding: '6px 8px' }} aria-label={t('workflow.editPhases')}>
              <Icon name="calendar" size={ICON_BUTTON_SIZE} />
            </SirenButton>
          </Tooltip>
        )}

        <Tooltip title={t('workflow.permissions')}>
          <SirenButton variant="ghost" onClick={onOpenPermissions} sx={{ padding: '6px 8px' }} aria-label={t('workflow.permissions')}>
            <Icon name="shield" size={ICON_BUTTON_SIZE} />
          </SirenButton>
        </Tooltip>
      </Stack>

      {recv && (
        <Chip label="Recipient-dept view" size="small" variant="outlined"
          sx={{ color: T.vi, borderColor: T.vi3, background: T.vi2 }} />
      )}

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

      <SirenButton onClick={onOpenHld}>
        <Icon name="grid" /> HLD Release
      </SirenButton>
    </Stack>
  );
}
