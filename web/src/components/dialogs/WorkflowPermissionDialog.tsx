import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowDto } from '@/types/domain';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Chip } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { T } from '@/theme/tokens';

interface Props {
  workflow: WorkflowDto;
  own: boolean;
  onClose: () => void;
  /** api/는 사용자를 조회할 수 없으므로 department도 함께 보낸다 (BE가 'analog'인지 재검증). */
  onAddOwner: (knoxId: string, department: string) => void;
  onRemoveOwner: (knoxId: string) => void;
  onAddViewGrant: (knoxId: string, department: string) => void;
  onRemoveViewGrant: (knoxId: string) => void;
}

/**
 * 목업 ownerDlgH() — 담당자·권한. Owner(Edit) 후보는 Analog 부서로 고정된다
 * (실제 방어는 BE, 설계서 3.3, 6.2) — SDP 검색으로 아무나 찾은 뒤 'analog' 소속으로 추가한다.
 */
export function WorkflowPermissionDialog({
  workflow, own, onClose, onAddOwner, onRemoveOwner, onAddViewGrant, onRemoveViewGrant,
}: Props) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const primary = workflow.owners.length ? resolveUser(workflow.owners[0]) : null;

  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [removeOwnerTarget, setRemoveOwnerTarget] = useState<string | null>(null);
  const [removeViewTarget, setRemoveViewTarget] = useState<string | null>(null);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={560}
      header={
        <>
          <Ey>{workflow.name}</Ey>
          <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>{t('workflow.permissions')}</Box>
        </>
      }
    >
      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Primary Owner</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <UserAvatar user={primary} size={30} />
          <Box>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>{primary?.name ?? '—'}</Box>
            <Box sx={{ fontSize: 11, color: T.dm2 }}>
              {primary?.department ?? ''} · set up this workflow initially
            </Box>
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Edit access — Analog department only</Ey>
        {workflow.owners.map((knoxId, i) => {
          const o = resolveUser(knoxId);
          return (
            <Box key={knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
              <UserAvatar user={o} size={26} />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {o.name}
                  {i === 0 && <Chip tone="s" sx={{ padding: '1px 6px', fontSize: 10 }}>Primary</Chip>}
                </Box>
                <Box sx={{ fontSize: 11, color: T.dm2 }}>{o.department}</Box>
              </Box>
              {own && i > 0 && (
                <SirenButton variant="ghost" onClick={() => setRemoveOwnerTarget(knoxId)}>
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          );
        })}
        {own && (
          <Box sx={{ mt: '10px' }}>
            <SirenButton onClick={() => setAddOwnerOpen(true)}>
              <Icon name="plus" /> {t('workflow.addOwner')}
            </SirenButton>
          </Box>
        )}
      </Card>

      <Card>
        <Ey sx={{ mb: '9px' }}>View access — any department</Ey>
        {workflow.viewGrants.length ? (
          workflow.viewGrants.map((g) => {
            const gu = resolveUser(g.knoxId);
            return (
              <Box key={g.knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
                <UserAvatar user={gu} size={26} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500 }}>{gu.name}</Box>
                  <Box sx={{ fontSize: 11, color: T.dm2 }}>Position: {g.department}</Box>
                </Box>
                {own && (
                  <SirenButton variant="ghost" onClick={() => setRemoveViewTarget(g.knoxId)}>
                    <Icon name="trash" />
                  </SirenButton>
                )}
              </Box>
            );
          })
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No one has view access yet.</Box>
        )}
        {own && (
          <>
            <Box sx={{ mt: '10px' }}>
              <SirenButton onClick={() => setAddViewOpen(true)}>
                <Icon name="plus" /> {t('workflow.addViewGrant')}
              </SirenButton>
            </Box>
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '8px' }}>
              The position set here maps to the deliverable's "recipient department" list.
            </Box>
          </>
        )}
      </Card>

      {addOwnerOpen && (
        <UserSearchDialog
          title={t('workflow.addOwner')}
          excludeKnoxIds={new Set(workflow.owners)}
          fixedDepartment="analog"
          onClose={() => setAddOwnerOpen(false)}
          onConfirm={(knoxId) => { onAddOwner(knoxId, 'analog'); setAddOwnerOpen(false); }}
        />
      )}

      {addViewOpen && (
        <UserSearchDialog
          title={t('workflow.addViewGrant')}
          excludeKnoxIds={new Set([...workflow.owners, ...workflow.viewGrants.map((g) => g.knoxId)])}
          requireDepartment
          onClose={() => setAddViewOpen(false)}
          onConfirm={(knoxId, department) => { onAddViewGrant(knoxId, department ?? ''); setAddViewOpen(false); }}
        />
      )}

      {removeOwnerTarget && (
        <ConfirmDialog
          title={t('workflow.confirmRemoveOwnerTitle')}
          message={t('workflow.confirmRemoveOwnerMessage', { name: resolveUser(removeOwnerTarget).name, knoxId: removeOwnerTarget })}
          confirmLabel={t('members.remove')}
          cancelLabel={t('members.cancel')}
          onCancel={() => setRemoveOwnerTarget(null)}
          onConfirm={() => { onRemoveOwner(removeOwnerTarget); setRemoveOwnerTarget(null); }}
        />
      )}

      {removeViewTarget && (
        <ConfirmDialog
          title={t('workflow.confirmRemoveViewGrantTitle')}
          message={t('workflow.confirmRemoveViewGrantMessage', { name: resolveUser(removeViewTarget).name, knoxId: removeViewTarget })}
          confirmLabel={t('members.remove')}
          cancelLabel={t('members.cancel')}
          onCancel={() => setRemoveViewTarget(null)}
          onConfirm={() => { onRemoveViewGrant(removeViewTarget); setRemoveViewTarget(null); }}
        />
      )}
    </ModalShell>
  );
}
