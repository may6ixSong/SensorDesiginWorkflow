import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/app/providers/AuthProvider';
import { apiClient } from '@/api/client';
import { HubService } from '@/hooks/useHubServices';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, TextArea, TextInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { initials } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { SirenButton } from '@/components/common/SirenButton';
import { T, FONT_MONO, R } from '@/theme/tokens';
import { toast } from '@/store/toastStore';

/** 원본 파일 상한 - 300KB. base64로 인코딩되면 문서에는 약 400KB(≈400,000자)로 들어간다. */
const MAX_ICON_BYTES = 300 * 1024;

type RegisterTier = 'A' | 'C';

const SECTIONS: { tier: RegisterTier; title: string; blurb: string }[] = [
  { tier: 'A', title: 'OA Service', blurb: 'Services reachable from the OA network (e.g. RPM, SimHub).' },
  { tier: 'C', title: 'HPC Service', blurb: 'Services reachable from the HPC network — version metadata only, no design files.' },
];

/**
 * Service Manage — Hub 레지스트리 관리 화면 (설계서 07장 §3). OA Service/HPC Service
 * 두 공간으로 나눈다 — File Artifacts(Calypso)는 SIREN 내장 기능이라 여기 등록 대상이
 * 아니다(04장 §3.1).
 *
 * FE도 자기 몫을 한다(01장 §5): non-admin에게는 진입 자체가 안 보이고, 여기서
 * 라우트 진입도 막아 URL 직접 접근을 차단한다. 판정은 반드시 **isRealAdmin**(실제
 * 호출자 기준)으로 한다 — 시뮬레이션 중 화면에 보이는 isAdmin은 대상 사용자 기준으로
 * 바뀌므로, 그걸로 게이팅하면 안 된다. 사용자 시뮬레이션 중에는 (실제로는 Admin이어도)
 * 접근을 막는다. 다만 이건 BE 검증을 대신하지 않는다 — api를 직접 두드리면 여전히
 * 서버의 isAdmin 재검증이 최종 방어선이다.
 */
export function ServiceManagePage() {
  const { isRealAdmin, isSimulating } = useAuth();
  if (!isRealAdmin) return <Navigate to="/no-access" replace />;
  if (isSimulating) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: '28px 32px' }}>
        <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
          <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', mb: '4px' }}>Service Manage</Box>
          <Box sx={{ fontSize: 12, color: T.dm2, mb: '22px' }}>
            Register the services this Hub can pull artifact versions from. File Artifacts (Calypso) is
            built into SIREN and isn&apos;t registered here.
          </Box>
          {SECTIONS.map((s) => (
            <ServiceSection key={s.tier} tier={s.tier} title={s.title} blurb={s.blurb} />
          ))}
        </Box>
      </Box>
    </AppShell>
  );
}

function ServiceSection({ tier, title, blurb }: { tier: RegisterTier; title: string; blurb: string }) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const { data: services = [] } = useQuery({
    queryKey: ['hub', 'services', 'all'],
    queryFn: async (): Promise<HubService[]> => {
      const { data } = await apiClient.get('/hub/services', { params: { includeDisabled: 'true' } });
      return data.data;
    },
  });
  const inSection = services.filter((s) => s.defaultTier === tier);

  return (
    <Box sx={{ mb: '30px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '4px' }}>
        <Box sx={{ fontSize: 14, fontWeight: 700 }}>{title}</Box>
        <Box sx={{ flex: 1 }} />
        <SirenButton variant="primary" onClick={() => setRegisterOpen(true)}>
          <Icon name="plus" /> Register artifact type
        </SirenButton>
      </Box>
      <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '14px' }}>{blurb}</Box>

      {inSection.length === 0 ? (
        <Box
          sx={{
            border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
            padding: '26px 20px', textAlign: 'center', fontSize: 12.5, color: T.dm2,
          }}
        >
          No {title} is registered yet.
        </Box>
      ) : (
        // Confluence 매크로 피커/MCP 서버 목록처럼 카드를 그리드로 늘어놓는다(사용자 요청).
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '12px',
          }}
        >
          {inSection.map((s) => <ServiceCard key={s.key} service={s} />)}
        </Box>
      )}

      {registerOpen && <RegisterDialog tier={tier} title={title} onClose={() => setRegisterOpen(false)} />}
    </Box>
  );
}

/** Service Manage 카드/폼에서 공유하는 favicon 렌더러 — 없거나 로드 실패 시 이니셜로 대체한다. */
function ServiceIcon({ name, url, size = 56 }: { name: string; url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!url && !failed;
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: '9px', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', overflow: 'hidden',
        fontSize: size * 0.33, fontWeight: 700, color: '#fff', background: T.pr,
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

/**
 * token을 보여주는 한 줄 — 복사 버튼은 항상 **전체 값**을 클립보드에 담는다.
 * `mask`가 true면 화면 표시만 앞 8자 + `****`로 가린다(사용자 요청, ServiceCard에서만
 * 쓴다). RegisterDialog의 발급 직후 화면은 그 자리에서 개발자에게 그대로 건네줘야
 * 하는 1회성 화면이라 `mask` 없이 그대로 둔다(기존 사용자 결정).
 */
function TokenRow({ label, value, mask = false }: { label: string; value: string; mask?: boolean }) {
  const display = mask && value.length > 8 ? `${value.slice(0, 8)}****` : value;
  return (
    <Box>
      <Box sx={{ fontSize: 10.5, color: T.dm2, mb: '4px' }}>{label}</Box>
      {/* value와 copy 버튼은 항상 같은 줄에 붙어 있어야 한다(사용자 요청) — label이 길어서
          줄바꿈돼도 이 둘은 따로 떨어지지 않게 label과 별도 줄로 뺐다. */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <Box
          sx={{
            fontFamily: FONT_MONO, fontSize: 11, color: T.tx, background: T.sf2,
            border: `1px solid ${T.ln}`, borderRadius: '6px', padding: '3px 8px',
            wordBreak: 'break-all', flex: '1 1 auto', minWidth: 0,
          }}
        >
          {display}
        </Box>
        <SirenButton
          variant="ghost"
          title="Copy"
          onClick={() => { navigator.clipboard?.writeText(value); toast('Copied'); }}
          sx={{ minWidth: 0, padding: '3px', flex: '0 0 auto' }}
        >
          <Icon name="copy" size={12} />
        </SirenButton>
      </Box>
    </Box>
  );
}

/**
 * Confluence 매크로 피커/MCP 서버 카드처럼 — 아이콘 + 이름을 크게, 설명은 짧게,
 * 세부 정보(token/artifact types)는 카드 안에 그대로 접어 넣는다(사용자 요청).
 * 연필 아이콘으로 그 자리에서 바로 수정할 수 있다 — name/description/favicon/baseURL
 * 전부(설계서상 baseURL은 원래 불변이어야 하지만, 사용자 결정으로 우선 열어 둔다).
 */
function ServiceCard({ service: s }: { service: HubService }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const toggle = useMutation({
    mutationFn: () => apiClient.patch(`/hub/services/${s.key}`, { enabled: !s.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast(s.enabled ? 'Service disabled — its token was revoked' : 'Service enabled — a new token was issued');
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save'),
  });

  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '16px', border: `1px solid ${T.ln}`, borderRadius: '12px',
        background: T.sf, opacity: s.enabled ? 1 : 0.6,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <ServiceIcon name={s.name} url={s.icon} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Box sx={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </Box>
            {!s.enabled && <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>Disabled</Badge>}
          </Box>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>{s.key}</Box>
        </Box>
        <SirenButton
          variant="ghost"
          title="Edit"
          onClick={() => setEditOpen(true)}
          sx={{ flex: '0 0 auto', minWidth: 0, padding: '5px' }}
        >
          <Icon name="edit" size={14} />
        </SirenButton>
      </Box>

      {s.baseUrl && (
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, wordBreak: 'break-all' }}>
          {s.baseUrl}
        </Box>
      )}

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

      {s.enabled && (
        <TokenRow label="Bearer token — shared by this baseURL" value={s.token ?? '(none)'} mask />
      )}

      <Box>
        <Box sx={{ fontSize: 10.5, color: T.dm2, mb: '6px' }}>
          Artifact type{s.artifactTypes.length === 1 ? '' : 's'} ({s.artifactTypes.length})
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {s.artifactTypes.map((t) => (
            <Box
              key={t.key}
              title={t.description || undefined}
              sx={{
                display: 'flex', alignItems: 'center', gap: '7px',
                fontSize: 11.5, fontWeight: 600, padding: '4px 6px 4px 9px', borderRadius: '8px',
                background: T.sf2, border: `1px solid ${T.ln}`,
              }}
            >
              <Box component="span" sx={{ flex: '0 0 auto' }}>{t.name}</Box>
              <Box
                component="span"
                sx={{
                  fontFamily: FONT_MONO, fontSize: 10, fontWeight: 500, color: T.dm2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: '1 1 auto',
                }}
              >
                {t.key}
              </Box>
              <SirenButton
                variant="ghost"
                title="Copy artifactTypeKey"
                onClick={() => { navigator.clipboard?.writeText(t.key); toast('Copied'); }}
                sx={{ minWidth: 0, padding: '3px', flex: '0 0 auto' }}
              >
                <Icon name="copy" size={11} />
              </SirenButton>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SirenButton onClick={() => toggle.mutate()} disabled={toggle.isPending}>
          {s.enabled ? 'Disable' : 'Enable'}
        </SirenButton>
      </Box>

      {editOpen && <EditServiceDialog service={s} onClose={() => setEditOpen(false)} />}
    </Box>
  );
}

/**
 * 카드 수정 다이얼로그 — name/description/favicon/baseURL을 즉시 PATCH한다.
 * key/token/tier/artifactTypes는 여기서 안 다룬다(설계서상 불변이거나 별도 경로).
 * baseURL은 원래 등록 후 불변이어야 맞지만(dedup 키이자 토큰 발급 기준), 지금 당장
 * 고칠 수 있게 열어 달라는 사용자 결정에 따라 막지 않는다 — 대신 그 위험을 한 줄로 알린다.
 */
function EditServiceDialog({ service: s, onClose }: { service: HubService; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [baseUrl, setBaseUrl] = useState(s.baseUrl ?? '');
  const [icon, setIcon] = useState(s.icon);
  const [nameErr, setNameErr] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/hub/services/${s.key}`, {
        name: name.trim(),
        description: description.trim(),
        baseUrl: baseUrl.trim(),
        icon,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      toast('Service updated');
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
      header={
        <>
          <Box sx={{ fontSize: 11, color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.key}</Box>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit service</Box>
        </>
      }
      footer={
        <SirenButton variant="primary" disabled={mutation.isPending} onClick={submit}>
          <Icon name="check" /> {mutation.isPending ? 'Saving…' : 'Save'}
        </SirenButton>
      }
    >
      <FaviconField name={name} icon={icon} onChange={setIcon} />
      <Field label="Service — display name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
        />
      </Field>
      <Field label="Description — optional">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="BaseURL — that service's API base address">
        <TextInput value={baseUrl} onChange={setBaseUrl} placeholder="https://…" />
      </Field>
      <Box sx={{ fontSize: 11, color: T.warn, lineHeight: 1.6, mb: '4px' }}>
        Changing this takes effect immediately — every live call to this service (candidate lookups,
        access checks, html-view) starts hitting the new address right away.
      </Box>
    </ModalShell>
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
    <Field label="Favicon — optional, shown on the card">
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

interface RegisterResult {
  key: string;
  name: string;
  artifactTypeKey: string;
  token: string | null;
  reusedExisting: boolean;
}

/**
 * 등록 폼 — Service명/Artifact명/Description/BaseURL만 받는다(설계서 07장 §3.1).
 * Tier 선택 필드는 없다 — 어느 section(OA Service/HPC Service)에서 열었는지로 이미
 * 정해진다. 제출하면 발급된 토큰과 artifactTypeKey를 그대로 보여준다(§3.2) — 1회
 * 노출 같은 장치는 두지 않는다(사용자 결정), 카드에서도 항상 같은 값을 다시 볼 수 있다.
 */
function RegisterDialog({ tier, title, onClose }: { tier: RegisterTier; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [icon, setIcon] = useState('');
  const [name, setName] = useState('');
  const [artifactName, setArtifactName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [nameErr, setNameErr] = useState(false);
  const [artifactNameErr, setArtifactNameErr] = useState(false);
  const [baseUrlErr, setBaseUrlErr] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [dupeNotice, setDupeNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/hub/services', {
        tier,
        name: name.trim(),
        artifactName: artifactName.trim(),
        description: description.trim() || undefined,
        baseUrl: baseUrl.trim(),
        icon: icon || undefined,
      });
      return data.data as RegisterResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hub'] });
      setResult(data);
      setDupeNotice(
        data.reusedExisting
          ? `This baseURL was already registered as “${data.name}” — added this artifact type to that existing service and reused its token.`
          : null,
      );
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to register'),
  });

  const submit = () => {
    let ok = true;
    if (!name.trim()) { setNameErr(true); ok = false; }
    if (!artifactName.trim()) { setArtifactNameErr(true); ok = false; }
    if (!baseUrl.trim()) { setBaseUrlErr(true); ok = false; }
    if (!ok) return;
    mutation.mutate();
  };

  // 등록에 성공하면 폼 대신 발급 결과(토큰 + artifactTypeKey)를 보여준다 — 다시 등록하려면
  // 다이얼로그를 닫고 새로 연다.
  if (result) {
    return (
      <ModalShell
        open
        onClose={onClose}
        width={480}
        header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>Registered</Box>}
      >
        {dupeNotice && (
          <Box
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              background: T.infoSoft, border: `1px solid ${T.infoLine}`, color: T.info,
              borderRadius: `${R.sm}px`, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, mb: '14px',
            }}
          >
            <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="info" /></Box>
            <Box>{dupeNotice}</Box>
          </Box>
        )}
        <Box sx={{ fontSize: 12.5, color: T.dm, lineHeight: 1.6, mb: '14px' }}>
          Hand both values below to the developer of that service — they hardcode them into the version
          events it sends to SIREN.
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px', mb: '18px' }}>
          <TokenRow label="artifactTypeKey — this artifact type" value={result.artifactTypeKey} />
          <TokenRow label="Bearer token — this service (shared by its baseURL)" value={result.token ?? '(none)'} />
        </Box>
        <SirenButton variant="primary" onClick={onClose}>
          <Icon name="check" /> Done
        </SirenButton>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Box sx={{ fontSize: 11, color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</Box>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Register artifact type</Box>
        </>
      }
      footer={
        <SirenButton variant="primary" disabled={mutation.isPending} onClick={submit}>
          <Icon name="check" /> {mutation.isPending ? 'Registering…' : 'Register'}
        </SirenButton>
      }
    >
      <FaviconField name={name} icon={icon} onChange={setIcon} />
      <Field label="Service — display name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
          placeholder="e.g. RPM"
        />
      </Field>
      <Field label="Artifact — the kind of artifact this baseURL produces">
        <TextInput
          value={artifactName}
          onChange={(v) => { setArtifactName(v); setArtifactNameErr(false); }}
          error={artifactNameErr}
          placeholder="e.g. Readout Pattern"
        />
      </Field>
      <Field label="Description — optional">
        <TextArea value={description} onChange={setDescription} rows={2} />
      </Field>
      <Field label="BaseURL — that service's API base address">
        <TextInput
          value={baseUrl}
          onChange={(v) => { setBaseUrl(v); setBaseUrlErr(false); }}
          error={baseUrlErr}
          placeholder="https://…"
        />
      </Field>
      <Box sx={{ fontSize: 11, color: T.dm2, lineHeight: 1.6 }}>
        If this baseURL is already registered, the existing Service name and token are kept — this just
        adds a new artifact type under it.
      </Box>
    </ModalShell>
  );
}
