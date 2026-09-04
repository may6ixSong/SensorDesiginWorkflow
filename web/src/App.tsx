import { Route, Routes } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from '@/app/providers/AuthProvider';
import { DetailsRedirect } from '@/pages/DetailsRedirect';
import { HomePage } from '@/pages/HomePage';
import { ServiceManagePage } from '@/pages/ServiceManagePage';
import { ProjectListPage } from '@/pages/ProjectListPage';
import { ProjectInfoPage } from '@/pages/ProjectInfoPage';
import { ProjectMembersPage } from '@/pages/ProjectMembersPage';
import { ArtifactListPage } from '@/pages/ArtifactListPage';
import { ArtifactDetailPage } from '@/pages/ArtifactDetailPage';
import { BoardPage } from '@/pages/BoardPage';
import { NoAccessPage } from '@/pages/NoAccessPage';
import { GuidePage } from '@/pages/GuidePage';

/**
 * 인증은 전부 프론트엔드(ADSSO)에서 끝난다 — app/providers/AuthProvider.tsx.
 * api/는 X-Knox-Id 헤더로만 호출자를 식별하므로, AuthProvider가 사용자를 확정하고
 * setApiKnoxId()로 헤더를 채운 뒤(loginSuccess)에야 조회 쿼리를 시작한다.
 */
function LoginGate({ children }: { children: React.ReactNode }) {
  const { loginSuccess } = useAuth();

  if (!loginSuccess) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <LoginGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<ProjectInfoPage />} />
        <Route path="/projects/:projectId/members" element={<ProjectMembersPage />} />
        <Route path="/projects/:projectId/artifacts" element={<ArtifactListPage />} />
        <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
        <Route path="/details" element={<DetailsRedirect />} />
        <Route path="/details/:projectId" element={<DetailsRedirect />} />
        <Route path="/details/:projectId/:workflowId" element={<BoardPage />} />
        <Route path="/service-manage" element={<ServiceManagePage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/no-access" element={<NoAccessPage />} />
      </Routes>
    </LoginGate>
  );
}
