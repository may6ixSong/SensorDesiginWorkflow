import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AccessGrant, WorkflowDto } from '@/types/domain';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { AccessGrantEditor } from '@/components/dialogs/AccessGrantEditor';
import { R, T } from '@/theme/tokens';

interface Props {
  workflow: WorkflowDto;
  /** 편집 가능한가 — View 권한자에게는 애초에 이 탭이 열리지 않지만, 방어적으로 받는다. */
  own: boolean;
  /** 부서 후보 — 그 과제에 등록된 부서(Project.departments). */
  departmentOptions: string[];
  editAccess: AccessGrant;
  viewAccess: AccessGrant;
  onChangeEdit: (next: AccessGrant) => void;
  onChangeView: (next: AccessGrant) => void;
}

/**
 * Workflow settings의 "Permissions" 탭 (설계서 01장 §3.3).
 *
 * ★ 안내 문구가 **Owner 위**에 온다 — 이 화면이 무엇을 정하는 곳인지 먼저 알려야 한다.
 * ★ Owner는 **정확히 1명이고 이양할 수 없다** — 그래서 추가/삭제 버튼이 아예 없다.
 * ★ Edit과 View에 **동시 등록을 허용**한다(부서가 겹칠 수 있으므로). 실효 권한은 항상
 *   더 높은 Edit이며, 그 판정은 서버가 한다 — 여기서 경고를 띄우지 않는다.
 * ★ workflow 소속 부서는 Edit Access에서 **삭제할 수 없다**(Admin도 불가). 자물쇠 배지가
 *   붙고 삭제 버튼이 렌더되지 않는다.
 */
export function WorkflowPermissionPanel({
  workflow, own, departmentOptions, editAccess, viewAccess, onChangeEdit, onChangeView,
}: Props) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const owner = workflow.ownerKnoxId ? resolveUser(workflow.ownerKnoxId) : null;

  return (
    <>
      {/* 이 화면이 무엇을 정하는 곳인지 — Owner 카드보다 위에 온다. */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: T.infoSoft, border: `1px solid ${T.infoLine}`,
          color: T.info, borderRadius: `${R.sm}px`,
          padding: '9px 12px', fontSize: 12.5, mb: '12px',
        }}
      >
        <Icon name="info" />
        {t('workflow.permissionsHint')}
      </Box>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>{t('workflow.owner')}</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserAvatar user={owner} size={30} />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>{owner?.name ?? workflow.ownerKnoxId ?? '—'}</Box>
            {/* Owner 이양은 현재 정책상 불가능하다 — 그 사실을 여기서 분명히 해 둔다. */}
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '1px' }}>{t('workflow.ownerNote')}</Box>
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '10px' }}>{t('workflow.editAccess')}</Ey>
        <AccessGrantEditor
          value={editAccess}
          onChange={onChangeEdit}
          departmentOptions={departmentOptions}
          pinnedDepartment={workflow.department}
          readOnly={!own}
        />
      </Card>

      <Card>
        <Ey sx={{ mb: '10px' }}>{t('workflow.viewAccess')}</Ey>
        <AccessGrantEditor
          value={viewAccess}
          onChange={onChangeView}
          departmentOptions={departmentOptions}
          readOnly={!own}
        />
      </Card>
    </>
  );
}
