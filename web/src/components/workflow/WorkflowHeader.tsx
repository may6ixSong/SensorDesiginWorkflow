import { useState } from 'react';
import { Box, Chip, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowDto } from '@/types/domain';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { R, T } from '@/theme/tokens';

interface WorkflowHeaderProps {
  workflow: WorkflowDto;
  /** 이 workflow에서 일정을 잃은 산출물 수 — 0보다 크면 헤더에 경고 chip이 붙는다. */
  orphanCount: number;
  /** Edit 권한 — 있어야 설정(연필)·Release 버튼이 보인다. */
  canEdit: boolean;
  /** 수신 부서 필터 후보 — 그 과제에 등록된 부서. */
  departmentOptions: string[];
  recipientFilter: string[];
  onChangeRecipientFilter: (next: string[]) => void;
  /** Workflow settings(Details/Schedule/Permissions 탭) 열기. */
  onOpenSettings: () => void;
  onOpenRelease?: () => void;
  onOpenHistory?: () => void;
}

const ICON_BUTTON_SIZE = 19.5;

/**
 * workflow명 · 소속 부서 · 수신 부서 필터 · 설정 · Release.
 *
 * ★ 캔버스 편집 중에는 여기(app bar 아래)의 액션이 전부 잠긴다 — 그 처리는 Canvas가
 *   편집 상태를 알고 있으므로 상위에서 내려주는 게 아니라, 편집 중 이 헤더 자체를
 *   비활성 컨테이너로 감싸는 방식으로 한다(설계서 03장 §4.3).
 */
export function WorkflowHeader({
  workflow, orphanCount, canEdit, departmentOptions, recipientFilter,
  onChangeRecipientFilter, onOpenSettings, onOpenRelease, onOpenHistory,
}: WorkflowHeaderProps) {
  const { t } = useTranslation();
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  const toggle = (dep: string) =>
    onChangeRecipientFilter(
      recipientFilter.includes(dep)
        ? recipientFilter.filter((d) => d !== dep)
        : [...recipientFilter, dep],
    );

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
              {workflow.department}
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

      {/* 수신 부서 필터 — 고른 부서가 받는 산출물만 남기고 나머지는 흐려진다. */}
      {departmentOptions.length > 0 && (
        <>
          <SirenButton
            variant={recipientFilter.length ? 'primary' : 'ghost'}
            onClick={(e) => setFilterAnchor(e.currentTarget as HTMLElement)}
          >
            <Icon name="list" />
            {recipientFilter.length
              ? `${t('canvas.recipientFilter')} · ${recipientFilter.length}`
              : t('canvas.allDepartments')}
          </SirenButton>
          <Menu
            anchorEl={filterAnchor}
            open={Boolean(filterAnchor)}
            onClose={() => setFilterAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => { onChangeRecipientFilter([]); setFilterAnchor(null); }}
              sx={{ fontSize: 13, fontWeight: recipientFilter.length ? 400 : 700 }}
            >
              {t('canvas.allDepartments')}
            </MenuItem>
            {departmentOptions.map((dep) => {
              const on = recipientFilter.includes(dep);
              return (
                <MenuItem key={dep} onClick={() => toggle(dep)} sx={{ fontSize: 13, gap: '8px' }}>
                  <Box sx={{ width: 14, display: 'inline-flex', color: on ? T.pr : 'transparent' }}>
                    <Icon name="check" />
                  </Box>
                  {dep}
                </MenuItem>
              );
            })}
          </Menu>
        </>
      )}

      {/* Release 이력은 view 권한자도 본다 — 무엇이 언제 전달됐는지는 받는 쪽도 알아야 한다. */}
      {onOpenHistory && (
        <Tooltip title={t('release.history')}>
          <SirenButton variant="ghost" onClick={onOpenHistory} aria-label={t('release.history')}>
            <Icon name="hist" size={ICON_BUTTON_SIZE} />
          </SirenButton>
        </Tooltip>
      )}

      {canEdit && onOpenRelease && (
        <SirenButton variant="primary" onClick={onOpenRelease}>
          <Icon name="send" /> {t('release.title')}
        </SirenButton>
      )}
    </Stack>
  );
}
