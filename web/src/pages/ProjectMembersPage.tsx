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
import { DepartmentsDialog } from '@/components/dialogs/DepartmentsDialog';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SirenButton } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
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

            <DepartmentsButton projectId={project._id} departments={project.departments} members={project.members} own={own} />
            {project.departments.length === 0 ? (
              <Box sx={{ fontSize: 12, color: T.dm2 }}>
                Add a department via "Manage departments" above before adding team members.
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px' }}>
                {project.departments.map((dept) => (
                  <DepartmentMemberCard
                    key={dept}
                    projectId={project._id}
                    deptName={dept}
                    members={project.members.filter((m) => m.departments.includes(dept))}
                    takenKnoxIds={new Set(
                      project.members.filter((m) => m.departments.includes(dept)).map((m) => m.knoxId),
                    )}
                    canManage={own}
                  />
                ))}
              </Box>
            )}
          </>
        );
      }}
    </ProjectPageShell>
  );
}

/**
 * "Team Members" 헤더 + 그 옆 "Manage departments" 버튼. Team Members를 추가하는 곳과
 * 같은 화면에서 부서를 관리할 수 있어야 새 부서를 만들고 바로 그 부서에 멤버를 추가하는
 * 흐름이 자연스럽다(사용자 요청) — 그래서 별도 섹션 대신 다이얼로그로 열게 했다. 다이얼로그
 * 안에서의 각 추가/삭제는 project 쿼리 캐시에 즉시 반영되므로, 다이얼로그를 닫으면 아래
 * Team Members 카드들이 이미 최신 부서 목록으로 보인다.
 */
function DepartmentsButton({
  projectId, departments, members, own,
}: {
  projectId: string; departments: string[]; members: ProjectMemberDto[]; own: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '26px', mb: '12px' }}>
      <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
        Team Members
        <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
          {members.length} people
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      {own && (
        <SirenButton onClick={() => setOpen(true)}>
          <Icon name="grid" /> Manage departments
        </SirenButton>
      )}

      {open && (
        <DepartmentsDialog
          projectId={projectId}
          departments={departments}
          members={members}
          onClose={() => setOpen(false)}
        />
      )}
    </Box>
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

/**
 * 부서(팀) 하나의 멤버 카드 — 이제 project.departments(자유 목록)에서 파생되고, 한 멤버가
 * 여러 부서 카드에 동시에 나타날 수 있다(ProjectMember.departments가 배열이라서). 그래서
 * takenKnoxIds는 "이 프로젝트 전체에서 이미 추가된 사람"이 아니라 "이 부서에 이미 있는
 * 사람"만 가리켜야 한다 — 다른 부서에 이미 속한 사람도 이 카드에서 추가로 고를 수 있어야
 * 한다.
 */
function DepartmentMemberCard({
  projectId, deptName, members, takenKnoxIds, canManage,
}: {
  projectId: string;
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
          fixedDepartment={deptName}
          onClose={() => setSearchOpen(false)}
          onConfirm={(knoxId, department) => {
            addMember.mutate(
              { knoxId, department: department ?? deptName },
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
          onConfirm={() => removeMember.mutate({ knoxId: target, department: deptName }, {
            onSuccess: () => { setTarget(null); toast('Member removed'); },
          })}
        />
      )}
    </Card>
  );
}
