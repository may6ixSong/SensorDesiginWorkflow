import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useProjects, useProjectIps } from '@/api/hooks/useProjects';

/**
 * "/" → 접근 가능한 첫 과제/IP로 리다이렉트 (설계서 7.1 라우팅).
 * "/projects/:projectId"로 직접 진입한 경우(과제 select 변경 등)에는 그 과제의 첫 IP로 보낸다.
 */
export function HomeRedirect() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const targetProjectId = routeProjectId ?? projects?.[0]?._id;
  const { data: ips, isLoading: ipsLoading } = useProjectIps(targetProjectId);

  useEffect(() => {
    if (projectsLoading) return;
    if (!projects?.length) {
      navigate('/no-access', { replace: true });
      return;
    }
    if (ipsLoading) return;
    if (!ips?.length) {
      navigate('/no-access', { replace: true });
      return;
    }
    navigate(`/projects/${targetProjectId}/ips/${ips[0].id}`, { replace: true });
  }, [projectsLoading, projects, ipsLoading, ips, targetProjectId, navigate]);

  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
      <CircularProgress />
    </Stack>
  );
}
