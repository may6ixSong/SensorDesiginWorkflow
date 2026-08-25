import { useState } from 'react';
import { Box } from '@mui/material';
import { ProjectMemberDto } from '@/types/domain';
import { useAddProjectMember, useRemoveProjectMember } from '@/api/hooks/useProjects';
import { useUsers } from '@/api/hooks/useUsers';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { DirectoryUser, findDirectoryUser } from '@/shared/constants/mock-users';
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
                takenKnoxIds={new Set(project.members.map((m) => m.knoxId))}
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
  projectId, deptId, deptName, members, allUsers, takenKnoxIds, canManage,
}: {
  projectId: string;
  deptId: string;
  deptName: string;
  members: ProjectMemberDto[];
  allUsers: DirectoryUser[];
  takenKnoxIds: Set<string>;
  canManage: boolean;
}) {
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const candidates = allUsers.filter((u) => !takenKnoxIds.has(u.knoxId));
  const [sel, setSel] = useState('');

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>{deptName}</Ey>
      {members.length ? (
        members.map((m) => {
          const mu = findDirectoryUser(m.knoxId);
          return (
            <Box
              key={m.knoxId}
              sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 0', borderBottom: `1px solid ${T.ln}` }}
            >
              <UserAvatar user={mu} size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mu.name}
                </Box>
                <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{departmentName(mu.department)}</Box>
              </Box>
              {canManage && (
                <SirenButton
                  variant="ghost"
                  onClick={() => removeMember.mutate(m.knoxId, { onSuccess: () => toast('Member removed') })}
                >
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          );
        })
      ) : (
        <Box sx={{ fontSize: 12, color: T.dm2, pb: '6px' }}>No members yet.</Box>
      )}

      {canManage && (
        <Row sx={{ mt: '10px' }}>
          <Field label="Add member" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={sel || candidates[0]?.knoxId || ''}
              onChange={setSel}
              disabled={!candidates.length}
              options={
                candidates.length
                  ? candidates.map((u) => ({ value: u.knoxId, label: u.name }))
                  : [{ value: '', label: 'Everyone is already on the roster' }]
              }
            />
          </Field>
          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <SirenButton
              disabled={!candidates.length}
              onClick={() => {
                const u = sel || candidates[0]?.knoxId;
                if (u) {
                  addMember.mutate(
                    { knoxId: u, department: deptId },
                    { onSuccess: () => { setSel(''); toast('Member added'); } },
                  );
                }
              }}
            >
              <Icon name="plus" /> Add
            </SirenButton>
          </Box>
        </Row>
      )}
    </Card>
  );
}
