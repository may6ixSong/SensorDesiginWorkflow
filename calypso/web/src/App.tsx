import { Link, Route, Routes } from 'react-router-dom';
import { Box, Stack } from '@mui/material';
import { T, FONT_DISPLAY } from '@/theme/tokens';
import { HomePage } from '@/pages/HomePage';
import { ArtifactsPage } from '@/pages/ArtifactsPage';
import { ArtifactDetailPage } from '@/pages/ArtifactDetailPage';

/**
 * 상단바에는 이동 컨트롤과 워드마크만 둔다 - 시스템이 무엇인지 설명하는 문구는
 * 어느 페이지에도 쓰지 않는다 (Hub 설계서 §14.1).
 */
function TopBar() {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={3}
      sx={{ px: 3, height: 52, borderBottom: `1px solid ${T.ln}`, background: T.sf, flex: 'none' }}
    >
      <Box
        component={Link}
        to="/"
        sx={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 15, color: T.tx, textDecoration: 'none' }}
      >
        CALYPSO
      </Box>
      <Box component={Link} to="/artifacts" sx={{ fontSize: 13, color: T.dm, textDecoration: 'none' }}>
        Artifacts
      </Box>
    </Stack>
  );
}

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <TopBar />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
        </Routes>
      </Box>
    </Box>
  );
}
