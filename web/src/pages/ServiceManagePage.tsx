import { useRef, useState } from 'react';
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

/** 원본 파일 상한 - 300KB. base64로 인코딩되면 문서에는 약 400KB(≈400,000자)로 들어간다. */
const MAX_ICON_BYTES = 300 * 1024;

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

/** 'add'는 신규 등록 다이얼로그, HubService면 그 서비스를 편집하는 다이얼로그. */
type FormTarget = 'add' | HubService | null;

function ServiceRegistry() {
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const { data: services = [] } = useQuery({
    queryKey: ['hub', 'services', 'all'],
    queryFn: async (): Promise<HubService[]> => {
      const { data } = await apiClient.get('/hub/services', { params: { includeDisabled: 'true' } });
      return data.data;
    },
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>Service Manage</Box>
        <Box sx={{ flex: 1 }} />
        <SirenButton variant="primary" onClick={() => setFormTarget('add')}>
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
          <ServiceCard key={s.key} service={s} onEdit={() => setFormTarget(s)} />
        ))}
      </Box>

      {formTarget && (
        <ServiceFormDialog
          service={formTarget === 'add' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}
    </Box>
  );
}

/**
 * Service Manage 카드/폼에서 공유하는 favicon 렌더러. 비어 있거나 로드에 실패하면
 * user badge(ProfileButton)와 똑같이 이니셜 배지로 대체한다 — favicon을 등록 안 한
 * 서비스도 항상 뭔가 뜨게 하기 위해서다.
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

function ServiceCard({ service: s, onEdit }: { service: HubService; onEdit: () => void }) {
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

      {/*
        Disable 버튼은 없다(사용자 요청) — 꺼도 이미 이 서비스로 등록된 산출물의
        연동 자체는 끊기지 않아서, 실제로 뭘 하는지 오해를 살 뿐이었다. 값을 바꾸고
        싶으면 Edit으로 들어간다.
      */}
      <SirenButton onClick={onEdit} sx={{ alignSelf: 'flex-start' }}>
        <Icon name="edit" /> Edit
      </SirenButton>
    </Box>
  );
}

/** 파일을 골라 base64 data URI로 인코딩한다. 별도 스토리지 없이 문서 필드에 바로 저장한다. */
function FaviconField({
  name, icon, onChange,
}: { name: string; icon: string; onChange: (dataUri: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Pick an image file.');
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      toast('Image is too large — pick one under 300KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Field label="Favicon — shown on the card">
      <Box sx={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <ServiceIcon name={name || '?'} url={icon} size={40} />
        <SirenButton onClick={() => inputRef.current?.click()}>
          <Icon name="plus" /> {icon ? 'Replace' : 'Upload'}
        </SirenButton>
        {icon && <SirenButton onClick={() => onChange('')}>Remove</SirenButton>}
        <Box
          component="input"
          type="file"
          accept="image/*"
          ref={inputRef}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          sx={{ display: 'none' }}
        />
      </Box>
    </Field>
  );
}

function ServiceFormDialog({ service, onClose }: { service?: HubService; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!service;
  const [icon, setIcon] = useState(service?.icon ?? '');
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [tier, setTier] = useState(service?.defaultTier ?? 'C');
  const [transport, setTransport] = useState(service?.transport ?? 'none');
  const [baseUrl, setBaseUrl] = useState(service?.baseUrl ?? '');
  const [viewUrlTemplate, setViewUrlTemplate] = useState(service?.viewUrlTemplate ?? '');
  const [nameErr, setNameErr] = useState(false);

  /**
   * A(Live)가 아니면 실연동이 없다는 뜻이라 transport는 무조건 none이고 잠긴다
   * (사용자 요청) — Base URL/View URL도 A일 때만 의미가 있으므로 같이 비운다.
   * A로 되돌아오면 transport가 비어 있던 경우에만 http로 다시 채워준다.
   */
  const changeTier = (next: string) => {
    setTier(next as HubService['defaultTier']);
    if (next !== 'A') {
      setTransport('none');
      setBaseUrl('');
      setViewUrlTemplate('');
    } else if (transport === 'none') {
      setTransport('http');
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        icon,
        description: description.trim(),
        defaultTier: tier,
        transport: tier === 'A' ? transport : 'none',
        baseUrl: tier === 'A' ? (baseUrl.trim() || undefined) : undefined,
        viewUrlTemplate: tier === 'A' ? (viewUrlTemplate.trim() || undefined) : undefined,
      };
      if (isEdit) {
        await apiClient.patch(`/hub/services/${service!.key}`, body);
      } else {
        await apiClient.post('/hub/services', body);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast(isEdit ? 'Service updated' : 'Service registered');
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save'),
  });

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    mutation.mutate();
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Edit service' : 'Add service'}</Box>}
    >
      {/* key는 이름을 바탕으로 서버가 자동 생성하고, 생성 후엔 바꿀 수 없다 — 편집
          화면에서도 참고용 읽기 전용으로만 보여준다 (§3.2). */}
      {isEdit && (
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, mb: '14px' }}>{service!.key}</Box>
      )}
      <FaviconField name={name} icon={icon} onChange={setIcon} />
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
          placeholder="e.g. SimHub"
        />
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="Tier">
        <SelectInput value={tier} onChange={changeTier} options={TIER_OPTIONS} />
      </Field>
      <Field label="Transport">
        <SelectInput
          value={transport}
          onChange={(v) => setTransport(v as HubService['transport'])}
          options={TRANSPORT_OPTIONS}
          disabled={tier !== 'A'}
        />
      </Field>
      {transport === 'http' && (
        <Field label="Base URL">
          <TextInput value={baseUrl} onChange={setBaseUrl} placeholder="https://…" />
        </Field>
      )}
      {tier === 'A' && (
        <Field label="View URL template — optional, {artifactId} is substituted">
          <TextInput value={viewUrlTemplate} onChange={setViewUrlTemplate} placeholder="https://…/{artifactId}" />
        </Field>
      )}
      <SirenButton
        variant="primary"
        disabled={!name.trim() || mutation.isPending}
        onClick={submit}
        sx={{ mt: '4px' }}
      >
        <Icon name="check" /> {isEdit ? 'Save' : 'Register'}
      </SirenButton>
    </ModalShell>
  );
}
