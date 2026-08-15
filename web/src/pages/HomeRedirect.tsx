import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useProjects, useProjectIps } from '@/api/hooks/useProjects';
import { useDevLogin, useSwitchableUsers } from '@/api/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';

/**
 * "/" → 접근 가능한 첫 과제/IP로 리다이렉트 (설계서 7.1 라우팅).
 * "/projects/:projectId"로 직접 진입한 경우(과제 select 변경 등)에는 그 과제의 첫 IP로 보낸다.
 *
 * 현재 로그인된 사용자가 접근 가능한 과제가 하나도 없으면(예: 예전 세션에 로그인된 채로
 * 남아있던 브라우저의 localStorage 토큰이 접근 권한 없는 사용자인 경우), 곧바로 /no-access로
 * 보내기 전에 Analog 부서 사용자로 한 번 자동 전환을 시도한다 - Analog는 반드시 IP owner이므로
 * 접근 가능한 과제가 보장된다(설계서 3.3).
 */
export function HomeRedirect() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const { data: projects, isLoading: projectsLoading, isFetching: projectsFetching } = useProjects();
  const targetProjectId = routeProjectId ?? projects?.[0]?._id;
  const { data: ips, isLoading: ipsLoading } = useProjectIps(targetProjectId);
  const { data: switchableUsers } = useSwitchableUsers();
  const devLogin = useDevLogin();
  const recoveryAttempted = useRef(false);

  useEffect(() => {
    if (projectsLoading) return;

    if (!projects?.length) {
      // 루트 진입(routeProjectId 없음)일 때만 자동 복구를 시도한다.
      if (!routeProjectId && !recoveryAttempted.current) {
        if (switchableUsers === undefined) return; // 사용자 목록 로딩 대기 - 아직 포기하지 않는다
        const better = switchableUsers.find(
          (u) => u.department === 'analog' && u.id !== currentUser?.id,
        );
        recoveryAttempted.current = true;
        if (better) {
          devLogin.mutate(better.id);
          return;
        }
      }
      // devLogin 진행 중이거나(성공 직후 무효화된 쿼리가 아직 재요청 중일 때 포함) 성급하게
      // /no-access로 보내지 않도록 projects 쿼리 자체의 in-flight 상태도 함께 확인한다.
      if (devLogin.isPending || projectsFetching) return;
      navigate('/no-access', { replace: true });
      return;
    }

    if (ipsLoading) return;
    if (!ips?.length) {
      navigate('/no-access', { replace: true });
      return;
    }
    navigate(`/projects/${targetProjectId}/ips/${ips[0].id}`, { replace: true });
  }, [
    projectsLoading,
    projectsFetching,
    projects,
    ipsLoading,
    ips,
    targetProjectId,
    routeProjectId,
    switchableUsers,
    currentUser,
    devLogin,
    navigate,
  ]);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <CircularProgress />
    </Stack>
  );
}
