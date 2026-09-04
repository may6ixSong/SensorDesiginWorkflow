import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/app/providers/AuthProvider';
import { apiClient } from '@/api/client';
import { HubService } from '@/hooks/useHubServices';
import { T, FONT_MONO } from '@/theme/tokens';
import { SirenButton } from '@/components/common/SirenButton';

/**
 * Admin 전용 화면 — Hub 레지스트리 관리(§13.4). 사용자 시뮬레이터(§13)는 여기 없다 —
 * app bar의 user badge(ProfileButton)로 옮겼다(사용자 요청): Admin이 자기 화면 어디서든
 * 바로 시뮬레이션을 걸고 끌 수 있어야 하는 기능이라, 별도 페이지로 이동해야만 켤 수
 * 있는 게 오히려 어색하다는 판단.
 *
 * FE도 자기 몫을 한다(§13.3 규칙 6): 네비게이션 항목은 non-admin에게 렌더하지 않고,
 * 여기서 라우트 진입도 막아 URL 직접 접근을 차단한다. 다만 이건 BE 검증을 대신하지
 * 않는다 — api를 직접 두드리면 여전히 서버의 isAdmin 재검증이 최종 방어선이다.
 */
export function AdminPage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/no-access" replace />;

  return (
    <AppShell>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: '28px 32px' }}>
        <Box sx={{ maxWidth: 980, mx: 'auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <ServiceRegistry />
        </Box>
      </Box>
    </AppShell>
  );
}

/** Hub 레지스트리 (§3.2, §13.4). key는 생성 후 수정 불가라 읽기 전용으로 렌더한다. */
function ServiceRegistry() {
  const qc = useQueryClient();
  const { data: services = [] } = useQuery({
    queryKey: ['hub', 'services', 'all'],
    queryFn: async (): Promise<HubService[]> => {
      const { data } = await apiClient.get('/hub/services', { params: { includeDisabled: 'true' } });
      return data.data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (s: HubService) => {
      await apiClient.patch(`/hub/services/${s.key}`, { enabled: !s.enabled });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub'] }),
  });

  return (
    <Section title="Artifact services">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {services.map((s) => (
          <Box
            key={s.key}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px 70px auto',
              gap: '14px',
              alignItems: 'center',
              p: '11px 14px',
              border: `1px solid ${T.ln}`,
              borderRadius: '8px',
              background: T.sf,
              opacity: s.enabled ? 1 : 0.55,
            }}
          >
            <Box>
              <Box sx={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, mt: '2px' }}>{s.key}</Box>
            </Box>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>{s.transport}</Box>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>tier {s.defaultTier}</Box>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>{s.contractVersion}</Box>
            <SirenButton onClick={() => toggle.mutate(s)}>
              {s.enabled ? 'Disable' : 'Enable'}
            </SirenButton>
          </Box>
        ))}
      </Box>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', mb: '12px' }}>{title}</Box>
      {children}
    </Box>
  );
}
