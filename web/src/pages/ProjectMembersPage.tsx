import { useState } from 'react';
import { Box } from '@mui/material';
import { ProjectMemberDto } from '@/types/domain';
import {
  useAddProjectMember, useAddProjectManager, useRemoveProjectMember, useRemoveProjectManager,
} from '@/api/hooks/useProjects';
import { useUsers } from '@/api/hooks/useUsers';
import { useAuth } from '@/app/providers/AuthProvider';
import { canEditMilestones } from '@/lib/access';
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
  const { user: me, isAdmin } = useAuth();

  return (
    <ProjectPageShell>
      {({ project, own }) => {
        const canManageManagers = canEditMilestones(project, isAdmin, me?.KnoxID);
        return (
          <>
            <ProjectManagersCard
              projectId={project._id}
              managers={project.managers}
              allUsers={users ?? []}
              canManage={canManageManagers}
            />

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
        );
      }}
    </ProjectPageShell>
  );
}

/**
 * Project Manager — 과제 마일스톤(공통 일정)을 수정할 수 있는 사람 (Workflow의
 * Edit 권한/owners와는 별개 role, web/src/lib/access.ts의 canEditMilestones 참고).
 * Admin이거나 이미 Manager인 사람만 다른 Manager를 추가/제거할 수 있다 —
 * Workflow의 "기존 owner가 다른 owner를 추가"하는 패턴과 동일하다.
 */
function ProjectManagersCard({
  projectId, managers, allUsers, canManage,
}: {
  projectId: string; managers: string[]; allUsers: DirectoryUser[]; canManage: boolean;
}) {
  const addManager = useAddProjectManager(projectId);
  const removeManager = useRemoveProjectManager(projectId);
  const candidates = allUsers.filter((u) => !managers.includes(u.knoxId));
  const [sel, setSel] = useState('');

  return (
    <Card sx={{ mb: '18px' }}>
      <Ey sx={{ mb: '9px' }}>Project Managers — can edit milestones</Ey>
      {managers.length ? (
        managers.map((knoxId) => {
          const mu = findDirectoryUser(knoxId);
          return (
            <Box
              key={knoxId}
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
                  onClick={() => removeManager.mutate(knoxId, { onSuccess: () => toast('Manager removed') })}
                >
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          );
        })
      ) : (
        <Box sx={{ fontSize: 12, color: T.dm2, pb: '6px' }}>No project managers yet.</Box>
      )}

      {canManage && (
        <Row sx={{ mt: '10px' }}>
          <Field label="Add manager" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={sel || candidates[0]?.knoxId || ''}
              onChange={setSel}
              disabled={!candidates.length}
              options={
                candidates.length
                  ? candidates.map((u) => ({ value: u.knoxId, label: u.name }))
                  : [{ value: '', label: 'Everyone is already a manager' }]
              }
            />
          </Field>
          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <SirenButton
              disabled={!candidates.length}
              onClick={() => {
                const u = sel || candidates[0]?.knoxId;
                if (u) {
                  addManager.mutate(u, { onSuccess: () => { setSel(''); toast('Manager added'); } });
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
