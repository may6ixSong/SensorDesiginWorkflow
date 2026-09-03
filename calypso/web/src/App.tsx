import { Route, Routes } from 'react-router-dom';
import { CircularProgress, Stack } from '@mui/material';
import { useAuth } from '@/app/providers/AuthProvider';
import { ProjectListPage } from '@/pages/ProjectListPage';
import { ProjectArtifactsPage } from '@/pages/ProjectArtifactsPage';
import { ArtifactDetailPage } from '@/pages/ArtifactDetailPage';
import { GuidePage } from '@/pages/GuidePage';

/**
 * 인증은 SIREN web과 동일하게 전부 프론트엔드(ADSSO)에서 끝난다 — AuthProvider가
 * 사용자를 확정하고 setApiKnoxId()로 헤더를 채운 뒤(loginSuccess)에야 조회 쿼리를
 * 시작한다. 각 페이지가 자기 AppShell을 직접 감싼다(SIREN web과 같은 패턴) — 여기서는
 * 라우팅만 한다.
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
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<ProjectArtifactsPage />} />
        <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
        <Route path="/guide" element={<GuidePage />} />
      </Routes>
    </LoginGate>
  );
}
