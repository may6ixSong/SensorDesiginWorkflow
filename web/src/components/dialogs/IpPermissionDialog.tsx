import { useState } from 'react';
import { Box } from '@mui/material';
import { IpDto, UserDto } from '@/types/domain';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Chip } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { T } from '@/theme/tokens';

interface Props {
  ip: IpDto;
  users: UserDto[];
  own: boolean;
  onClose: () => void;
  onAddOwner: (userId: string) => void;
  onRemoveOwner: (userId: string) => void;
  onAddViewGrant: (userId: string, department: string) => void;
  onRemoveViewGrant: (userId: string) => void;
}

/**
 * 목업 ownerDlgH() — 담당자·권한.
 * Edit 후보를 Analog로 필터링하는 건 UX 편의일 뿐이고, 실제 방어는 BE에 있다 (설계서 3.3, 6.2).
 */
export function IpPermissionDialog({
  ip, users, own, onClose, onAddOwner, onRemoveOwner, onAddViewGrant, onRemoveViewGrant,
}: Props) {
  const primary = ip.owners[0];
  const analogCandidates = users.filter(
    (u) => u.department === 'analog' && !ip.owners.some((o) => o.id === u.id),
  );
  const viewCandidates = users.filter(
    (u) => !ip.owners.some((o) => o.id === u.id) && !ip.viewGrants.some((g) => g.user.id === u.id),
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
          <Ey>{ip.name}</Ey>
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
              {primary ? departmentName(primary.department) : ''} · set up this IP workflow initially
            </Box>
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>Edit access — Analog department only</Ey>
        {ip.owners.map((o, i) => (
          <Box key={o.id} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
            <UserAvatar user={o} size={26} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {o.name}
                {i === 0 && <Chip tone="s" sx={{ padding: '1px 6px', fontSize: 10 }}>Primary</Chip>}
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{departmentName(o.department)}</Box>
            </Box>
            {own && i > 0 && (
              <SirenButton variant="ghost" onClick={() => onRemoveOwner(o.id)}>
                <Icon name="trash" />
              </SirenButton>
            )}
          </Box>
        ))}
        {own && (
          <Row sx={{ mt: '10px' }}>
            <Field label="Add Analog member" sx={{ flex: 1, mb: 0 }}>
              <SelectInput
                value={ownerSel || analogCandidates[0]?.id || ''}
                onChange={setOwnerSel}
                disabled={!analogCandidates.length}
                options={
                  analogCandidates.length
                    ? analogCandidates.map((u) => ({ value: u.id, label: u.name }))
                    : [{ value: '', label: 'No eligible members' }]
                }
              />
            </Field>
            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
              <SirenButton
                disabled={!analogCandidates.length}
                onClick={() => {
                  const u = ownerSel || analogCandidates[0]?.id;
                  if (u) onAddOwner(u);
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
        {ip.viewGrants.length ? (
          ip.viewGrants.map((g) => (
            <Box key={g.user.id} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
              <UserAvatar user={g.user} size={26} />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ fontSize: 13, fontWeight: 500 }}>{g.user.name}</Box>
                <Box sx={{ fontSize: 11, color: T.dm2 }}>Position: {departmentName(g.department)}</Box>
              </Box>
              {own && (
                <SirenButton variant="ghost" onClick={() => onRemoveViewGrant(g.user.id)}>
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          ))
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No one has view access yet.</Box>
        )}
        {own && (
          <>
            <Row sx={{ mt: '10px' }}>
              <Field label="Target" sx={{ flex: 1, mb: 0 }}>
                <SelectInput
                  value={viewUser || viewCandidates[0]?.id || ''}
                  onChange={setViewUser}
                  disabled={!viewCandidates.length}
                  options={
                    viewCandidates.length
                      ? viewCandidates.map((u) => ({ value: u.id, label: u.name }))
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
                    const u = viewUser || viewCandidates[0]?.id;
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
