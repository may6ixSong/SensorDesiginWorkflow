import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useProjects, useProjectWorkflows } from '@/api/hooks/useProjects';

/**
 * "/details" → 접근 가능한 첫 과제/IP의 보드로 리다이렉트 (설계서 7.1 라우팅).
 * "/details/:projectId"로 진입한 경우(과제 select 변경 등)에는 그 과제의 첫 IP로 보낸다.
 *
 * 로그인 사용자(ADSSO)가 접근 가능한 과제/IP가 하나도 없으면 /no-access로 보낸다 —
 * 사용자 전환(목업 스위처)은 더 이상 존재하지 않으므로 자동 복구 시도도 없다.
 */
export function DetailsRedirect() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { data: projects, isLoading: projectsLoading, isFetching: projectsFetching } = useProjects();
  const targetProjectId = routeProjectId ?? projects?.[0]?._id;
  const { data: workflows, isLoading: ipsLoading } = useProjectWorkflows(targetProjectId);

  useEffect(() => {
    if (projectsLoading) return;

    if (!projects?.length) {
      // 재요청이 아직 진행 중이면 성급하게 /no-access로 보내지 않는다.
      if (projectsFetching) return;
      navigate('/no-access', { replace: true });
      return;
    }

    if (ipsLoading) return;
    if (!workflows?.length) {
      navigate('/no-access', { replace: true });
      return;
    }
    navigate(`/details/${targetProjectId}/${workflows[0].id}`, { replace: true });
  }, [
    projectsLoading,
    projectsFetching,
    projects,
    ipsLoading,
    workflows,
    targetProjectId,
    routeProjectId,
    navigate,
  ]);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <CircularProgress />
    </Stack>
  );
}
