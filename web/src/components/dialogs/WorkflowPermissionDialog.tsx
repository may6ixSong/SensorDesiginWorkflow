import { useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowDto } from '@/types/domain';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { DirectoryUser, findDirectoryUser } from '@/shared/constants/mock-users';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { T } from '@/theme/tokens';

interface Props {
  workflow: WorkflowDto;
  users: DirectoryUser[];
  own: boolean;
  onClose: () => void;
  /** api/는 사용자를 조회할 수 없으므로 department도 함께 보낸다 (BE가 'analog'인지 재검증). */
  onAddOwner: (knoxId: string, department: string) => void;
  onRemoveOwner: (knoxId: string) => void;
  onAddViewGrant: (knoxId: string, department: string) => void;
  onRemoveViewGrant: (knoxId: string) => void;
}

/**
 * 목업 ownerDlgH() — 담당자·권한.
 * Edit 후보를 Analog로 필터링하는 건 UX 편의일 뿐이고, 실제 방어는 BE에 있다 (설계서 3.3, 6.2).
 */
export function WorkflowPermissionDialog({
  workflow, users, own, onClose, onAddOwner, onRemoveOwner, onAddViewGrant, onRemoveViewGrant,
}: Props) {
  const owners = workflow.owners.map(findDirectoryUser);
  const primary = owners[0];
  const analogCandidates = users.filter(
    (u) => u.department === 'analog' && !workflow.owners.includes(u.knoxId),
  );
  const viewCandidates = users.filter(
    (u) => !workflow.owners.includes(u.knoxId) && !workflow.viewGrants.some((g) => g.knoxId === u.knoxId),
  );

  const [ownerSel, setOwnerSel] = useState('');
  const [viewUser, setViewUser] = useState('');
  const [viewDept, setViewDept] = useState<string>(DEPARTMENTS[0].id);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={560}
      header={
        <>
          <Ey>{workflow.name}</Ey>
          <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>Owners & Permissions</Box>
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
              {primary ? departmentName(primary.department) : ''} · set up this workflow workflow initially
            </Box>
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Edit access — Analog department only</Ey>
        {owners.map((o, i) => (
          <Box key={o.knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
            <UserAvatar user={o} size={26} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {o.name}
                {i === 0 && <Chip tone="s" sx={{ padding: '1px 6px', fontSize: 10 }}>Primary</Chip>}
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{departmentName(o.department)}</Box>
            </Box>
            {own && i > 0 && (
              <SirenButton variant="ghost" onClick={() => onRemoveOwner(o.knoxId)}>
                <Icon name="trash" />
              </SirenButton>
            )}
          </Box>
        ))}
        {own && (
          <Row sx={{ mt: '10px' }}>
            <Field label="Add Analog member" sx={{ flex: 1, mb: 0 }}>
              <SelectInput
                value={ownerSel || analogCandidates[0]?.knoxId || ''}
                onChange={setOwnerSel}
                disabled={!analogCandidates.length}
                options={
                  analogCandidates.length
                    ? analogCandidates.map((u) => ({ value: u.knoxId, label: u.name }))
                    : [{ value: '', label: 'No eligible members' }]
                }
              />
            </Field>
            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
              <SirenButton
                disabled={!analogCandidates.length}
                onClick={() => {
                  const u = ownerSel || analogCandidates[0]?.knoxId;
                  if (u) onAddOwner(u, 'analog');
                }}
              >
                <Icon name="plus" /> Add
              </SirenButton>
            </Box>
          </Row>
        )}
      </Card>

      <Card>
        <Ey sx={{ mb: '9px' }}>View access — any department</Ey>
        {workflow.viewGrants.length ? (
          workflow.viewGrants.map((g) => {
            const gu = findDirectoryUser(g.knoxId);
            return (
              <Box key={g.knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
                <UserAvatar user={gu} size={26} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500 }}>{gu.name}</Box>
                  <Box sx={{ fontSize: 11, color: T.dm2 }}>Position: {departmentName(g.department)}</Box>
                </Box>
                {own && (
                  <SirenButton variant="ghost" onClick={() => onRemoveViewGrant(g.knoxId)}>
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
            <Row sx={{ mt: '10px' }}>
              <Field label="Target" sx={{ flex: 1, mb: 0 }}>
                <SelectInput
                  value={viewUser || viewCandidates[0]?.knoxId || ''}
                  onChange={setViewUser}
                  disabled={!viewCandidates.length}
                  options={
                    viewCandidates.length
                      ? viewCandidates.map((u) => ({ value: u.knoxId, label: u.name }))
                      : [{ value: '', label: 'No eligible members' }]
                  }
                />
              </Field>
              <Field label="Position (dept)" sx={{ width: 150, mb: 0 }}>
                <SelectInput
                  value={viewDept}
                  onChange={setViewDept}
                  options={DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))}
                />
              </Field>
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <SirenButton
                  disabled={!viewCandidates.length}
                  onClick={() => {
                    const u = viewUser || viewCandidates[0]?.knoxId;
                    if (u) onAddViewGrant(u, viewDept);
                  }}
                >
                  <Icon name="plus" /> Add
                </SirenButton>
              </Box>
            </Row>
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '8px' }}>
              The position set here maps to the deliverable's "recipient department" list.
            </Box>
          </>
        )}
      </Card>
    </ModalShell>
  );
}
