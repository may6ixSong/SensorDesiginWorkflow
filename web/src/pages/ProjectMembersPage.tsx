import { useState } from 'react';
import { Box } from '@mui/material';
import { UserDto } from '@/types/domain';
import { useAddProjectMember, useRemoveProjectMember } from '@/api/hooks/useProjects';
import { useUsers } from '@/api/hooks/useUsers';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Card, Ey, Field, Row, SelectInput } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

export function ProjectMembersPage() {
  const { data: users } = useUsers();

  return (
    <ProjectPageShell>
      {({ project, own }) => (
        <>
          <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', mb: '12px' }}>
            Team Members
            <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
              {project.members.length} people
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px' }}>
            {DEPARTMENTS.map((dept) => (
              <DepartmentMemberCard
                key={dept.id}
                projectId={project._id}
                deptId={dept.id}
                deptName={dept.name}
                members={project.members.filter((m) => m.department === dept.id)}
                allUsers={users ?? []}
                takenUserIds={new Set(project.members.map((m) => m.user.id))}
                canManage={own}
              />
            ))}
          </Box>
        </>
      )}
    </ProjectPageShell>
  );
}

function DepartmentMemberCard({
  projectId, deptId, deptName, members, allUsers, takenUserIds, canManage,
}: {
  projectId: string;
  deptId: string;
  deptName: string;
  members: { user: UserDto; department: string; addedAt: string }[];
  allUsers: UserDto[];
  takenUserIds: Set<string>;
  canManage: boolean;
}) {
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const candidates = allUsers.filter((u) => !takenUserIds.has(u.id));
  const [sel, setSel] = useState('');

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>{deptName}</Ey>
      {members.length ? (
        members.map((m) => (
          <Box
            key={m.user.id}
            sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 0', borderBottom: `1px solid ${T.ln}` }}
          >
            <UserAvatar user={m.user} size={26} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.user.name}
              </Box>
              <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{departmentName(m.user.department)}</Box>
            </Box>
            {canManage && (
              <AcroButton
                variant="ghost"
                onClick={() => removeMember.mutate(m.user.id, { onSuccess: () => toast('Member removed') })}
              >
                <Icon name="trash" />
              </AcroButton>
            )}
          </Box>
        ))
      ) : (
        <Box sx={{ fontSize: 12, color: T.dm2, pb: '6px' }}>No members yet.</Box>
      )}

      {canManage && (
        <Row sx={{ mt: '10px' }}>
          <Field label="Add member" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={sel || candidates[0]?.id || ''}
              onChange={setSel}
              disabled={!candidates.length}
              options={
                candidates.length
                  ? candidates.map((u) => ({ value: u.id, label: u.name }))
                  : [{ value: '', label: 'Everyone is already on the roster' }]
              }
            />
          </Field>
          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <AcroButton
              disabled={!candidates.length}
              onClick={() => {
                const u = sel || candidates[0]?.id;
                if (u) {
                  addMember.mutate(
                    { userId: u, department: deptId },
                    { onSuccess: () => { setSel(''); toast('Member added'); } },
                  );
                }
              }}
            >
              <Icon name="plus" /> Add
            </AcroButton>
          </Box>
        </Row>
      )}
    </Card>
  );
}
