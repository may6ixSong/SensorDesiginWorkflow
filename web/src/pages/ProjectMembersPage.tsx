import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ProjectMemberDto } from '@/types/domain';
import {
  useAddProjectMember, useAddProjectManager, useRemoveProjectMember, useRemoveProjectManager,
} from '@/api/hooks/useProjects';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { canEditMilestones } from '@/lib/access';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SirenButton } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { DEPARTMENTS } from '@/shared/constants/departments';
import { toast } from '@/store/toastStore';
import { T } from '@/theme/tokens';

export function ProjectMembersPage() {
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
  projectId, managers, canManage,
}: {
  projectId: string; managers: string[]; canManage: boolean;
}) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const addManager = useAddProjectManager(projectId);
  const removeManager = useRemoveProjectManager(projectId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  return (
    <Card sx={{ mb: '18px' }}>
      <Ey sx={{ mb: '9px' }}>Project Managers — can edit milestones</Ey>
      {managers.length ? (
        managers.map((knoxId) => {
          const mu = resolveUser(knoxId);
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
                <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{mu.department}</Box>
              </Box>
              {canManage && (
                <SirenButton variant="ghost" onClick={() => setTarget(knoxId)}>
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
        <Box sx={{ mt: '10px' }}>
          <SirenButton onClick={() => setSearchOpen(true)}>
            <Icon name="plus" /> {t('members.addManager')}
          </SirenButton>
        </Box>
      )}

      {searchOpen && (
        <UserSearchDialog
          title={t('members.addManager')}
          excludeKnoxIds={new Set(managers)}
          onClose={() => setSearchOpen(false)}
          onConfirm={(knoxId) => {
            addManager.mutate(knoxId, {
              onSuccess: () => { setSearchOpen(false); toast('Manager added'); },
              onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to add'),
            });
          }}
        />
      )}

      {target && (
        <ConfirmDialog
          title={t('members.confirmRemoveManagerTitle')}
          message={t('members.confirmRemoveManagerMessage', { name: resolveUser(target).name, knoxId: target })}
          confirmLabel={t('members.remove')}
          cancelLabel={t('members.cancel')}
          busy={removeManager.isPending}
          onCancel={() => setTarget(null)}
          onConfirm={() => removeManager.mutate(target, {
            onSuccess: () => { setTarget(null); toast('Manager removed'); },
          })}
        />
      )}
    </Card>
  );
}

function DepartmentMemberCard({
  projectId, deptId, deptName, members, takenKnoxIds, canManage,
}: {
  projectId: string;
  deptId: string;
  deptName: string;
  members: ProjectMemberDto[];
  takenKnoxIds: Set<string>;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  return (
    <Card>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '9px' }}>
        <Ey sx={{ flex: 1 }}>{deptName}</Ey>
        {canManage && (
          <SirenButton variant="ghost" onClick={() => setSearchOpen(true)} aria-label={t('members.addMember')}>
            <Icon name="plus" />
          </SirenButton>
        )}
      </Box>
      {members.length ? (
        members.map((m) => {
          const mu = resolveUser(m.knoxId);
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
                <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{mu.department}</Box>
              </Box>
              {canManage && (
                <SirenButton variant="ghost" onClick={() => setTarget(m.knoxId)}>
                  <Icon name="trash" />
                </SirenButton>
              )}
            </Box>
          );
        })
      ) : (
        <Box sx={{ fontSize: 12, color: T.dm2, pb: '6px' }}>No members yet.</Box>
      )}

      {searchOpen && (
        <UserSearchDialog
          title={`${t('members.addMember')} — ${deptName}`}
          excludeKnoxIds={takenKnoxIds}
          fixedDepartment={deptId}
          onClose={() => setSearchOpen(false)}
          onConfirm={(knoxId, department) => {
            addMember.mutate(
              { knoxId, department: department ?? deptId },
              {
                onSuccess: () => { setSearchOpen(false); toast('Member added'); },
                onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to add'),
              },
            );
          }}
        />
      )}

      {target && (
        <ConfirmDialog
          title={t('members.confirmDeleteMemberTitle')}
          message={t('members.confirmDeleteMemberMessage', { name: resolveUser(target).name, knoxId: target, dept: deptName })}
          warning={t('members.confirmDeleteMemberWarning')}
          confirmLabel={t('members.remove')}
          cancelLabel={t('members.cancel')}
          busy={removeMember.isPending}
          onCancel={() => setTarget(null)}
          onConfirm={() => removeMember.mutate(target, {
            onSuccess: () => { setTarget(null); toast('Member removed'); },
          })}
        />
      )}
    </Card>
  );
}
