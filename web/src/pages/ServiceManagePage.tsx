import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/app/providers/AuthProvider';
import { apiClient } from '@/api/client';
import { HubService } from '@/hooks/useHubServices';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, SelectInput, TextArea, TextInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { initials } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { SirenButton } from '@/components/common/SirenButton';
import { T, FONT_MONO } from '@/theme/tokens';
import { toast } from '@/store/toastStore';

const TIER_OPTIONS = [
  { value: 'A', label: 'A — Live' },
  { value: 'B', label: 'B — Synced' },
  { value: 'C', label: 'C — Linked' },
  { value: 'D', label: 'D — Attested' },
];
const TRANSPORT_OPTIONS = [
  { value: 'http', label: 'http' },
  { value: 'shared-db', label: 'shared-db' },
  { value: 'none', label: 'none' },
];

/**
 * Service Manage — Hub 레지스트리 관리 화면 (설계서 §13.4). 예전 AdminPage의 admin
 * 전용 두 기능(사용자 시뮬레이터 + 레지스트리 관리) 중 레지스트리 관리만 여기 남는다 —
 * 사용자 시뮬레이터는 헤더의 user badge(ProfileButton)에서 연다.
 *
 * FE도 자기 몫을 한다(§13.3 규칙 6): non-admin에게는 진입 자체가 안 보이고, 여기서
 * 라우트 진입도 막아 URL 직접 접근을 차단한다. 판정은 반드시 **isRealAdmin**(실제
 * 호출자 기준)으로 한다 — 시뮬레이션 중 화면에 보이는 isAdmin은 대상 사용자 기준으로
 * 바뀌므로, 그걸로 게이팅하면 안 된다. 사용자 시뮬레이션 중에는 (실제로는 Admin이어도)
 * 접근을 막는다 — 시뮬레이션 대상의 권한으로 레지스트리를 고칠 수 없어야 하기
 * 때문(§13.3 규칙 2). 다만 이건 BE 검증을 대신하지 않는다 — api를 직접 두드리면
 * 여전히 서버의 isAdmin 재검증이 최종 방어선이다.
 */
export function ServiceManagePage() {
  const { isRealAdmin, isSimulating } = useAuth();
  if (!isRealAdmin) return <Navigate to="/no-access" replace />;
  if (isSimulating) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: '28px 32px' }}>
        <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
          <ServiceRegistry />
        </Box>
      </Box>
    </AppShell>
  );
}

function ServiceRegistry() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
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
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>Service Manage</Box>
        <Box sx={{ flex: 1 }} />
        <SirenButton variant="primary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" /> Add service
        </SirenButton>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {services.map((s) => (
          <ServiceCard key={s.key} service={s} onToggle={() => toggle.mutate(s)} />
        ))}
      </Box>

      {addOpen && <AddServiceDialog onClose={() => setAddOpen(false)} />}
    </Box>
  );
}

/**
 * Service Manage 카드/폼에서 공유하는 favicon 렌더러. 비어 있거나 로드에 실패하면
 * 이니셜 배지로 대체한다 — 값을 사용자가 입력한 URL이 실제 이미지를 가리키는지는
 * 등록 시점엔 검증하지 않으므로, 깨진 URL이 화면을 망치지 않게 여기서 흡수한다.
 */
function ServiceIcon({ name, url, size = 40 }: { name: string; url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!url && !failed;
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: '9px', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', overflow: 'hidden',
        fontSize: size * 0.33, fontWeight: 700, color: '#fff', background: T.tl,
      }}
    >
      {showImg ? (
        <Box
          component="img"
          src={url}
          alt=""
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
        />
      ) : (
        initials(name)
      )}
    </Box>
  );
}

function ServiceCard({ service: s, onToggle }: { service: HubService; onToggle: () => void }) {
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '16px', border: `1px solid ${T.ln}`, borderRadius: '12px',
        background: T.sf, opacity: s.enabled ? 1 : 0.55,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <ServiceIcon name={s.name} url={s.icon} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </Box>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>{s.key}</Box>
        </Box>
      </Box>

      {s.description && (
        <Box
          sx={{
            fontSize: 12, color: T.dm, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {s.description}
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{s.transport}</Badge>
        <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>tier {s.defaultTier}</Badge>
        <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>v{s.contractVersion}</Badge>
      </Box>

      <Box sx={{ flex: 1 }} />

      <SirenButton onClick={onToggle} sx={{ alignSelf: 'flex-start' }}>
        {s.enabled ? 'Disable' : 'Enable'}
      </SirenButton>
    </Box>
  );
}

function AddServiceDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [icon, setIcon] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [defaultTier, setDefaultTier] = useState('C');
  const [transport, setTransport] = useState('none');
  const [baseUrl, setBaseUrl] = useState('');
  const [viewUrlTemplate, setViewUrlTemplate] = useState('');
  const [nameErr, setNameErr] = useState(false);
  const [keyErr, setKeyErr] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/hub/services', {
        key: key.trim(),
        name: name.trim(),
        icon: icon.trim(),
        description: description.trim(),
        defaultTier,
        transport,
        baseUrl: transport === 'http' ? baseUrl.trim() || undefined : undefined,
        viewUrlTemplate: viewUrlTemplate.trim() || undefined,
        enabled: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast('Service registered');
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to register'),
  });

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    if (!/^[a-z0-9-]+$/.test(key.trim())) {
      setKeyErr('Lowercase letters, numbers and hyphens only.');
      return;
    }
    setKeyErr('');
    mutation.mutate();
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>Add service</Box>}
    >
      <Field label="Favicon URL — shown on the card">
        <Box sx={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ServiceIcon name={name || '?'} url={icon} size={34} />
          <Box sx={{ flex: 1 }}>
            <TextInput value={icon} onChange={setIcon} placeholder="https://…/favicon.ico" />
          </Box>
        </Box>
      </Field>
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
          placeholder="e.g. SimHub"
        />
      </Field>
      <Field label="Key — immutable once created">
        <TextInput
          value={key}
          onChange={(v) => { setKey(v); setKeyErr(''); }}
          error={!!keyErr}
          placeholder="e.g. simhub"
        />
        {keyErr && <Box sx={{ fontSize: 11, color: T.rd, mt: '5px' }}>{keyErr}</Box>}
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="Default tier">
        <SelectInput value={defaultTier} onChange={setDefaultTier} options={TIER_OPTIONS} />
      </Field>
      <Field label="Transport">
        <SelectInput value={transport} onChange={setTransport} options={TRANSPORT_OPTIONS} />
      </Field>
      {transport === 'http' && (
        <Field label="Base URL">
          <TextInput value={baseUrl} onChange={setBaseUrl} placeholder="https://…" />
        </Field>
      )}
      <Field label="View URL template — optional, {artifactId} is substituted">
        <TextInput value={viewUrlTemplate} onChange={setViewUrlTemplate} placeholder="https://…/{artifactId}" />
      </Field>
      <SirenButton
        variant="primary"
        disabled={!name.trim() || !key.trim() || mutation.isPending}
        onClick={submit}
        sx={{ mt: '4px' }}
      >
        <Icon name="check" /> Register
      </SirenButton>
    </ModalShell>
  );
}
