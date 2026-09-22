import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowDto } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { useDepartmentLabel } from '@/hooks/useDepartmentLabel';
import { ViewMode } from '@/lib/viewMode';
import { R, T } from '@/theme/tokens';

interface WorkflowHeaderProps {
  workflow: WorkflowDto;
  /** 이 workflow에서 일정을 잃은 산출물 수 — 0보다 크면 헤더에 경고 chip이 붙는다. */
  orphanCount: number;
  /** Edit 권한 — 있어야 설정(연필) 버튼이 보인다. */
  canEdit: boolean;
  /** Workflow settings(Details/Schedule/Permissions 탭) 열기. */
  onOpenSettings: () => void;
  /** canvas/list 전환 — 매트릭스 아이콘 버튼 왼쪽에 세그먼트 버튼 2개로 그린다(사용자 요청). */
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  /**
   * "Artifact별 전달 부서" 매트릭스 열기 — canvas/list 전환 바로 오른쪽의 table 아이콘
   * 버튼(사용자 요청). canEdit이 아니면 이 버튼 자체를 그리지 않는다 — 그 다이얼로그는
   * edit 권한자 전용이다.
   */
  onOpenRecipientMatrix?: () => void;
}

const ICON_BUTTON_SIZE = 19.5;

/**
 * workflow명 · 소속 부서 · view 전환 · 설정.
 *
 * ★ canvas view와 list view가 공유하는 유일한 헤더다(사용자 요청) — 예전에는 Release
 *   history 페이지가 "Back to canvas" 버튼과 자기만의 막대를 따로 그렸지만, 이제 이
 *   헤더 하나로 통일한다. 예전 History(시계) 버튼은 없앴다 — list view 자체가 그 자리를
 *   대신한다.
 * ★ 캔버스 편집 중에는 여기(app bar 아래)의 액션이 전부 잠긴다 — 그 처리는 Canvas가
 *   편집 상태를 알고 있으므로 상위에서 내려주는 게 아니라, 편집 중 이 헤더 자체를
 *   비활성 컨테이너로 감싸는 방식으로 한다(설계서 03장 §4.3).
 * ★ 부서 필터와 Release 버튼은 이 헤더에서 **제거됐다**(스펙 §6.1) — 부서 스코프는
 *   list view의 chip 탭이 갖고, release도 거기서만 낸다. canvas view는 그 두 컨트롤이
 *   빠진 것 외에는 달라지지 않는다.
 */
export function WorkflowHeader({
  workflow, orphanCount, canEdit, onOpenSettings, viewMode, onChangeViewMode,
  onOpenRecipientMatrix,
}: WorkflowHeaderProps) {
  const { t } = useTranslation();
  const { label: deptLabel } = useDepartmentLabel(workflow.projectId);

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
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {workflow.name}
            </Typography>
            {/* 소속 부서는 권한의 근거라 이름 옆에 항상 보인다. */}
            <Box
              sx={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
                color: T.pr, background: T.prSoft, border: `1px solid ${T.prLine}`,
                padding: '1px 7px', borderRadius: `${R.pill}px`, flexShrink: 0,
              }}
            >
              {deptLabel(workflow.department)}
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap>
            {workflow.description}
          </Typography>
        </Box>

        {canEdit && (
          <Tooltip title={t('workflow.settings')}>
            <SirenButton
              variant="ghost"
              onClick={onOpenSettings}
              sx={{ padding: '6px 8px' }}
              aria-label={t('workflow.settings')}
            >
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
          sx={{ color: T.danger, borderColor: T.dangerLine, background: T.dangerSoft }}
        />
      )}

      {/* canvas/list 전환 — 매트릭스 아이콘 버튼 왼쪽. 선택된 쪽만 활성화된 것처럼 보인다. */}
      <Stack direction="row" sx={{ border: `1px solid ${T.ln2}`, borderRadius: `${R.sm}px`, overflow: 'hidden' }}>
        <SirenButton
          variant={viewMode === 'canvas' ? 'on' : 'ghost'}
          onClick={() => onChangeViewMode('canvas')}
          sx={{ borderRadius: 0, border: 'none' }}
        >
          <Icon name="grid" size={13} /> Canvas
        </SirenButton>
        <SirenButton
          variant={viewMode === 'list' ? 'on' : 'ghost'}
          onClick={() => onChangeViewMode('list')}
          sx={{ borderRadius: 0, border: 'none' }}
        >
          <Icon name="list" size={13} /> List
        </SirenButton>
      </Stack>

      {/* Artifact별 전달 부서 매트릭스 — canvas/list 전환 바로 오른쪽. edit 권한자 전용. */}
      {canEdit && onOpenRecipientMatrix && (
        <Tooltip title={t('recipientMatrix.tooltip')}>
          <SirenButton
            variant="ghost"
            onClick={onOpenRecipientMatrix}
            sx={{ padding: '6px 8px' }}
            aria-label={t('recipientMatrix.tooltip')}
          >
            <Icon name="excel" size={ICON_BUTTON_SIZE} />
          </SirenButton>
        </Tooltip>
      )}
    </Stack>
  );
}
