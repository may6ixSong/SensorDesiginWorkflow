import { useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { useArtifactServices } from '@/api/hooks/useHub';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, SelectInput, TextInput } from '@/components/common/Panel';
import { ExternalArtifactPicker } from '@/components/deliverable/ExternalArtifactPicker';
import { CalypsoArtifactPicker } from '@/components/deliverable/CalypsoArtifactPicker';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

type SourceMode = 'none' | 'service' | 'calypso';

interface Props {
  workflowName: string;
  phases: WorkflowPhase[];
  /** external artifact 후보 검색 기준(Hub 설계서 §19.3) — 없으면 자유 입력으로만 동작한다. */
  projectCode?: string;
  projectRevision?: string;
  /** Calypso artifact 목록 조회 대상 project와, ACL 부서 판정에 쓰는 내 부서 목록. */
  projectId?: string;
  myDepartments?: string[];
  /** 'received'면 헤더 문구가 "내가 받아야 할 산출물"로 바뀐다 — 폼 필드 자체는 동일하다. */
  intent?: 'own' | 'received';
  onClose: () => void;
  onCreate: (p: {
    name: string; phaseId: string; artifactKey: string | null;
    serviceKey: string | null; externalArtifactId: string | null; artifactTypeKey: string | null;
  }) => void;
}

/**
 * 산출물 추가 — 항상 phase 하나에 하나씩 만든다. 같은 산출물이 여러 phase에 걸쳐
 * 반복 release되는 경우엔, 그 phase마다 이 다이얼로그를 다시 열어 같은 Artifact key로
 * 따로 추가한다(한 번에 여러 phase를 골라 일괄 생성하던 방식은 더 이상 지원하지 않는다
 * — 사용자 요청). 같은 phase에 이미 같은 key가 있으면 BE가 생성을 거절한다.
 *
 * 여기 뜨는 phase는 전부 "이 workflow가 정한 자기 일정"이다 — 과제 마일스톤이 아니다.
 */
export function AddDeliverableDialog({
  workflowName, phases, projectCode, projectRevision, projectId, myDepartments, intent = 'own',
  onClose, onCreate,
}: Props) {
  const { data: services, isLoading: servicesLoading } = useArtifactServices();
  const [name, setName] = useState('');
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '');
  const [artifactKey, setArtifactKey] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('none');
  const [serviceKey, setServiceKey] = useState('');
  const [externalArtifactId, setExternalArtifactId] = useState('');
  const [artifactTypeKey, setArtifactTypeKey] = useState('');
  const [err, setErr] = useState(false);
  const [keyErr, setKeyErr] = useState('');
  const [typeErr, setTypeErr] = useState(false);

  const selectedService = (services ?? []).find((s) => s.key === serviceKey) ?? null;
  const artifactTypes = selectedService?.artifactTypes ?? [];

  /** Tier A(연동된 서비스)와 Calypso는 등록 방법이 완전히 다르다 — code+revision 후보
   * 검색 vs 내가 view 권한 있는 Calypso artifact 목록. 그래서 같은 dropdown 하나에
   * 섞지 않고 먼저 방식부터 고르게 한다(사용자 요청). */
  const switchSourceMode = (mode: SourceMode) => {
    setSourceMode(mode);
    setExternalArtifactId('');
    setArtifactTypeKey('');
    setServiceKey(mode === 'calypso' ? 'calypso' : '');
    setTypeErr(false);
  };

  const submit = () => {
    if (!name.trim() || !phaseId) { setErr(true); return; }
    const key = artifactKey.trim();
    if (key && !/^[A-Za-z0-9_.-]+$/.test(key)) {
      setKeyErr('Only letters, numbers, dot, underscore and hyphen are allowed.');
      return;
    }
    setKeyErr('');
    // 서비스가 산출물 종류를 여러 개 낼 때만 사람이 골라야 한다(§19.1) — 1개뿐이면
    // 아래 Source 선택 시 이미 자동으로 채워져 있다. API도 같은 규칙을 강제하지만,
    // 여기서 먼저 걸러 왕복 없이 바로 알려준다.
    if (serviceKey && artifactTypes.length > 1 && !artifactTypeKey) {
      setTypeErr(true);
      return;
    }
    setTypeErr(false);
    onCreate({
      name: name.trim(), phaseId, artifactKey: key || null,
      serviceKey, externalArtifactId: externalArtifactId.trim() || null,
      artifactTypeKey: artifactTypes.length > 0 ? artifactTypeKey || null : null,
    });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{workflowName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>
            {intent === 'received' ? 'Add Artifact I Need to Receive' : 'Add Deliverable'}
          </Box>
        </>
      }
    >
      {intent === 'received' && (
        <Box
          sx={{
            fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
            borderRadius: '9px', padding: '9px 11px', mb: '12px', lineHeight: 1.7,
          }}
        >
          This creates a placeholder for something you're waiting to receive — someone else will add it
          through a connected service once it's ready, so there's no upload here.
        </Box>
      )}
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(false); }}
          error={err}
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>
      <Field label="Phase — this deliverable is created for one phase at a time">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.id}
              component="button"
              type="button"
              title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
              onClick={() => { setPhaseId(p.id); setErr(false); }}
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                background: phaseId === p.id ? T.prSoft : T.sf,
                border: `1px solid ${phaseId === p.id ? T.pr : T.ln2}`,
                color: phaseId === p.id ? T.pr : T.dm,
                '&:hover': { background: phaseId === p.id ? T.prSoft : T.sf3 },
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.danger }}>
              This workflow has no phases yet — add a schedule before creating deliverables.
            </Box>
          )}
        </Box>
      </Field>
      <Field label="Source — where this deliverable's real data lives">
        <Box sx={{ display: 'flex', gap: '5px' }}>
          {([
            { m: 'none' as const, label: 'Not linked' },
            { m: 'service' as const, label: 'Connected Service' },
            { m: 'calypso' as const, label: 'Files' },
          ]).map(({ m, label }) => (
            <Box
              key={m}
              component="button"
              type="button"
              onClick={() => switchSourceMode(m)}
              sx={{
                flex: 1, fontSize: 11.5, fontWeight: 600, padding: '7px 8px',
                borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                background: sourceMode === m ? T.prSoft : T.sf,
                border: `1px solid ${sourceMode === m ? T.pr : T.ln2}`,
                color: sourceMode === m ? T.pr : T.dm,
                '&:hover': { background: sourceMode === m ? T.prSoft : T.sf3 },
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      </Field>

      {sourceMode === 'service' && (
        <>
          <Field label="Connected service">
            <SelectInput
              value={serviceKey}
              onChange={(v) => {
                setServiceKey(v);
                const svc = (services ?? []).find((s) => s.key === v);
                const types = svc?.artifactTypes ?? [];
                // 종류가 1개뿐이면 고르라고 묻지 않고 그 1개를 자동으로 쓴다(§19.1).
                setArtifactTypeKey(types.length === 1 ? types[0].key : '');
                setExternalArtifactId('');
                setTypeErr(false);
              }}
              disabled={servicesLoading}
              options={[
                { value: '', label: servicesLoading ? 'Loading…' : 'Choose a service…' },
                ...(services ?? []).map((s) => ({ value: s.key, label: s.name })),
              ]}
            />
          </Field>
          {artifactTypes.length > 1 && (
            <Field label="Artifact type — this service provides more than one kind">
              <SelectInput
                value={artifactTypeKey}
                onChange={(v) => { setArtifactTypeKey(v); setTypeErr(false); }}
                options={[
                  { value: '', label: 'Choose one…' },
                  ...artifactTypes.map((t) => ({ value: t.key, label: t.name })),
                ]}
              />
              {typeErr && (
                <Box sx={{ fontSize: 11, color: T.danger, mt: '5px' }}>
                  {selectedService?.name} provides more than one artifact type — pick one.
                </Box>
              )}
            </Field>
          )}
          <ExternalArtifactPicker
            service={selectedService}
            projectCode={projectCode}
            projectRevision={projectRevision}
            value={externalArtifactId}
            onChange={setExternalArtifactId}
          />
        </>
      )}

      {sourceMode === 'calypso' && (
        <CalypsoArtifactPicker
          projectId={projectId}
          myDepartments={myDepartments ?? []}
          value={externalArtifactId}
          onChange={setExternalArtifactId}
        />
      )}
      <Field
        label="Artifact key — optional; use the same key when adding this artifact again in another phase"
      >
        <TextInput
          value={artifactKey}
          onChange={(v) => { setArtifactKey(v); setKeyErr(''); }}
          error={!!keyErr}
          placeholder="e.g. PLL_MAIN.DESIGN_REVIEW_PACKAGE"
        />
        {keyErr && <Box sx={{ fontSize: 11, color: T.danger, mt: '5px' }}>{keyErr}</Box>}
      </Field>
      <SirenButton variant="primary" onClick={submit}>
        <Icon name="plus" /> Create
      </SirenButton>
    </ModalShell>
  );
}
