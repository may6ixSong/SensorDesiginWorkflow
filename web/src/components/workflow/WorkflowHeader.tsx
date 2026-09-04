import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowDto } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface WorkflowHeaderProps {
  workflow: WorkflowDto;
  /** 이 workflow에서 일정을 잃은 산출물 수 — 0보다 크면 헤더에 경고 chip이 붙는다. */
  orphanCount: number;
  /** Edit 권한(canEditWorkflow) — 있어야 설정(연필)·HLD Release 버튼이 보인다(사용자 요청). */
  canEdit: boolean;
  onOpenHld: () => void;
  /** Workflow settings(Details/Schedule/Permissions 탭) 열기. */
  onOpenSettings: () => void;
}

/** Workflow settings 아이콘 버튼 크기 — 이전 크기(26px, shield 13px의 2배)의 3/4. */
const ICON_BUTTON_SIZE = 19.5;

/**
 * workflow명, 설정(연필) 아이콘 버튼(workflow명 옆), HLD 버튼.
 *
 * 예전에는 일정 편집·권한 관리 아이콘 버튼이 따로 있었지만(사용자 요청으로 통합),
 * 지금은 이 연필 버튼 하나가 WorkflowSettingsDialog를 열고 그 안에서 탭으로 갈라진다 —
 * 일정 편집이 여기 딸린 이유는 그대로다: phase는 이제 workflow가 소유한 데이터라
 * 과제 화면이 아니라 이 workflow의 보드가 제자리다.
 */
export function WorkflowHeader({
  workflow, orphanCount, canEdit, onOpenHld, onOpenSettings,
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

        {canEdit && (
          <Tooltip title={t('workflow.settings')}>
            <SirenButton variant="ghost" onClick={onOpenSettings} sx={{ padding: '6px 8px' }} aria-label={t('workflow.settings')}>
              <Icon name="edit" size={ICON_BUTTON_SIZE} />
            </SirenButton>
          </Tooltip>
        )}
      </Stack>

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

      {canEdit && (
        <SirenButton onClick={onOpenHld}>
          <Icon name="grid" /> HLD Release
        </SirenButton>
      )}
    </Stack>
  );
}
