import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoArtifact, CalypsoGrant, CalypsoGrantInput } from '@/api/calypsoClient';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey, SelectInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { departmentName } from '@/shared/constants/departments';
import { T } from '@/theme/tokens';

interface Props {
  artifact: CalypsoArtifact;
  /** 부서 단위 edit 부여를 고를 때의 후보 — 서버가 "본인 소속 부서로만" 강제하므로
   * 여기서도 그 부서들만 보여준다(사용자 요청). */
  myDepartments: string[];
  /** 부서 단위 view 부여를 고를 때의 후보 — 이 project에 속한 어떤 부서든 가능. */
  allDepartments: string[];
  onAddEditor: (g: CalypsoGrantInput) => void;
  onRemoveEditor: (g: CalypsoGrantInput) => void;
  onAddViewGrant: (g: CalypsoGrantInput) => void;
  onRemoveViewGrant: (g: CalypsoGrantInput) => void;
}

function grantKey(g: { type: string; knoxId: string | null; department: string | null }): string {
  return `${g.type}:${g.knoxId ?? g.department}`;
}

function grantInput(g: CalypsoGrant): CalypsoGrantInput {
  return g.type === 'user' ? { type: 'user', knoxId: g.knoxId as string } : { type: 'department', department: g.department as string };
}

/**
 * Artifact별 독립 ACL 관리 — 등록자/Admin 외에 추가로 edit·view 권한을 부여/회수한다.
 * `myAccess==='edit'`인 사람만 호출부에서 이 패널을 띄운다(서버도 같은 조건으로 재검증).
 *
 * 워크플로우 상세 패널(DeliverableDialog)과 독립 Artifact detail page 양쪽에서 그대로
 * 재사용한다 — 권한 데이터는 Calypso 하나뿐이고 진입점만 두 개다(사용자 요청).
 */
export function ArtifactAccessPanel({
  artifact, myDepartments, allDepartments, onAddEditor, onRemoveEditor, onAddViewGrant, onRemoveViewGrant,
}: Props) {
  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Access</Ey>
      <GrantList
        label="Can edit"
        grants={artifact.editors}
        registrant={artifact.createdBy}
        deptOptions={myDepartments}
        deptHint={myDepartments.length ? undefined : 'You have no department in this project to grant edit to.'}
        onAdd={onAddEditor}
        onRemove={onRemoveEditor}
      />
      <Box sx={{ height: '14px' }} />
      <GrantList
        label="Can view"
        grants={artifact.viewGrants}
        deptOptions={allDepartments}
        onAdd={onAddViewGrant}
        onRemove={onRemoveViewGrant}
      />
    </Card>
  );
}

function GrantList({
  label, grants, registrant, deptOptions, deptHint, onAdd, onRemove,
}: {
  label: string;
  grants: CalypsoGrant[];
  /** 등록자는 목록에 없어도 항상 이 등급이라 별도 chip으로 보여준다(edit 목록에서만). */
  registrant?: string;
  deptOptions: string[];
  deptHint?: string;
  onAdd: (g: CalypsoGrantInput) => void;
  onRemove: (g: CalypsoGrantInput) => void;
}) {
  const { resolveUser } = useDirectory();
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [dept, setDept] = useState('');

  return (
    <Box>
      <Box sx={{ fontSize: 11.5, fontWeight: 600, color: T.dm, mb: '7px' }}>{label}</Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mb: '9px' }}>
        {registrant && (
          <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>{resolveUser(registrant).name} · registrant</Badge>
        )}
        {grants.length === 0 && !registrant && (
          <Box sx={{ fontSize: 12, color: T.dm2 }}>Nobody added yet.</Box>
        )}
        {grants.map((g) => (
          <Box
            key={grantKey(g)}
            sx={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px 3px 9px',
              borderRadius: '999px', border: `1px solid ${T.ln}`, background: T.sf,
            }}
          >
            {g.type === 'user' ? (
              <>
                <UserAvatar user={resolveUser(g.knoxId as string)} size={18} />
                <Box sx={{ fontSize: 12 }}>{resolveUser(g.knoxId as string).name}</Box>
              </>
            ) : (
              <Box sx={{ fontSize: 12 }}>{departmentName(g.department)} <Box component="span" sx={{ color: T.dm2 }}>(dept)</Box></Box>
            )}
            <SirenButton variant="ghost" onClick={() => onRemove(grantInput(g))} sx={{ minWidth: 0, padding: '2px' }}>
              <Icon name="x" size={11} />
            </SirenButton>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <SirenButton onClick={() => setUserSearchOpen(true)}>
          <Icon name="search" /> Add person
        </SirenButton>
        {deptOptions.length > 0 && (
          <>
            <Box sx={{ minWidth: 150 }}>
              <SelectInput
                value={dept}
                onChange={setDept}
                options={[
                  { value: '', label: 'Add department…' },
                  ...deptOptions.map((d) => ({ value: d, label: departmentName(d) })),
                ]}
              />
            </Box>
            <SirenButton
              disabled={!dept}
              onClick={() => { if (dept) { onAdd({ type: 'department', department: dept }); setDept(''); } }}
            >
              <Icon name="plus" /> Add
            </SirenButton>
          </>
        )}
        {deptHint && deptOptions.length === 0 && (
          <Box sx={{ fontSize: 11, color: T.dm2 }}>{deptHint}</Box>
        )}
      </Box>

      {userSearchOpen && (
        <UserSearchDialog
          title={`${label} — add person`}
          excludeKnoxIds={new Set(grants.filter((g) => g.type === 'user').map((g) => g.knoxId as string))}
          onClose={() => setUserSearchOpen(false)}
          onConfirm={(knoxId) => { onAdd({ type: 'user', knoxId }); setUserSearchOpen(false); }}
        />
      )}
    </Box>
  );
}
