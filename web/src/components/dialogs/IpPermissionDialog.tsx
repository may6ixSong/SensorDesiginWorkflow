import { useState } from 'react';
import { Box } from '@mui/material';
import { IpDto, UserDto } from '@/types/domain';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton, Chip } from '@/components/common/AcroButton';
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
          <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>담당자 · 권한</Box>
        </>
      }
    >
      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>대표 담당자</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <UserAvatar user={primary} size={30} />
          <Box>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>{primary?.name ?? '—'}</Box>
            <Box sx={{ fontSize: 11, color: T.dm2 }}>
              {primary ? departmentName(primary.department) : ''} · 이 IP workflow를 최초 구성
            </Box>
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '9px' }}>수정 권한(Edit) — Analog 부서만 가능</Ey>
        {ip.owners.map((o, i) => (
          <Box key={o.id} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
            <UserAvatar user={o} size={26} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {o.name}
                {i === 0 && <Chip tone="s" sx={{ padding: '1px 6px', fontSize: 10 }}>대표</Chip>}
              </Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{departmentName(o.department)}</Box>
            </Box>
            {own && i > 0 && (
              <AcroButton variant="ghost" onClick={() => onRemoveOwner(o.id)}>
                <Icon name="trash" />
              </AcroButton>
            )}
          </Box>
        ))}
        {own && (
          <Row sx={{ mt: '10px' }}>
            <Field label="Analog 부서원 추가" sx={{ flex: 1, mb: 0 }}>
              <SelectInput
                value={ownerSel || analogCandidates[0]?.id || ''}
                onChange={setOwnerSel}
                disabled={!analogCandidates.length}
                options={
                  analogCandidates.length
                    ? analogCandidates.map((u) => ({ value: u.id, label: u.name }))
                    : [{ value: '', label: '추가 가능한 인원 없음' }]
                }
              />
            </Field>
            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
              <AcroButton
                disabled={!analogCandidates.length}
                onClick={() => {
                  const u = ownerSel || analogCandidates[0]?.id;
                  if (u) onAddOwner(u);
                }}
              >
                <Icon name="plus" /> 추가
              </AcroButton>
            </Box>
          </Row>
        )}
      </Card>

      <Card>
        <Ey sx={{ mb: '9px' }}>열람 권한(View) — 전체 부서 가능</Ey>
        {ip.viewGrants.length ? (
          ip.viewGrants.map((g) => (
            <Box key={g.user.id} sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
              <UserAvatar user={g.user} size={26} />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ fontSize: 13, fontWeight: 500 }}>{g.user.name}</Box>
                <Box sx={{ fontSize: 11, color: T.dm2 }}>포지션: {departmentName(g.department)}</Box>
              </Box>
              {own && (
                <AcroButton variant="ghost" onClick={() => onRemoveViewGrant(g.user.id)}>
                  <Icon name="trash" />
                </AcroButton>
              )}
            </Box>
          ))
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>열람 권한을 받은 사용자가 없습니다.</Box>
        )}
        {own && (
          <>
            <Row sx={{ mt: '10px' }}>
              <Field label="대상" sx={{ flex: 1, mb: 0 }}>
                <SelectInput
                  value={viewUser || viewCandidates[0]?.id || ''}
                  onChange={setViewUser}
                  disabled={!viewCandidates.length}
                  options={
                    viewCandidates.length
                      ? viewCandidates.map((u) => ({ value: u.id, label: u.name }))
                      : [{ value: '', label: '추가 가능한 인원 없음' }]
                  }
                />
              </Field>
              <Field label="포지션(부서)" sx={{ width: 150, mb: 0 }}>
                <SelectInput
                  value={viewDept}
                  onChange={setViewDept}
                  options={DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))}
                />
              </Field>
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <AcroButton
                  disabled={!viewCandidates.length}
                  onClick={() => {
                    const u = viewUser || viewCandidates[0]?.id;
                    if (u) onAddViewGrant(u, viewDept);
                  }}
                >
                  <Icon name="plus" /> 추가
                </AcroButton>
              </Box>
            </Row>
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '8px' }}>
              여기서 지정한 포지션이 산출물의 "전달 받을 부서" 목록과 매핑됩니다.
            </Box>
          </>
        )}
      </Card>
    </ModalShell>
  );
}
