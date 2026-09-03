import { useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { useArtifactServices } from '@/api/hooks/useHub';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  phases: WorkflowPhase[];
  /** 'received'면 헤더 문구가 "내가 받아야 할 산출물"로 바뀐다 — 폼 필드 자체는 동일하다. */
  intent?: 'own' | 'received';
  onClose: () => void;
  onCreate: (p: {
    name: string; phaseId: string; artifactKey: string | null;
    serviceKey: string | null; externalArtifactId: string | null;
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
export function AddDeliverableDialog({ workflowName, phases, intent = 'own', onClose, onCreate }: Props) {
  const { data: services, isLoading: servicesLoading } = useArtifactServices();
  const [name, setName] = useState('');
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '');
  const [artifactKey, setArtifactKey] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [externalArtifactId, setExternalArtifactId] = useState('');
  const [err, setErr] = useState(false);
  const [svcErr, setSvcErr] = useState(false);
  const [keyErr, setKeyErr] = useState('');

  const submit = () => {
    if (!name.trim() || !phaseId) { setErr(true); return; }
    if (!serviceKey) { setSvcErr(true); return; }
    const key = artifactKey.trim();
    if (key && !/^[A-Za-z0-9_.-]+$/.test(key)) {
      setKeyErr('Only letters, numbers, dot, underscore and hyphen are allowed.');
      return;
    }
    setKeyErr('');
    onCreate({
      name: name.trim(), phaseId, artifactKey: key || null,
      serviceKey, externalArtifactId: externalArtifactId.trim() || null,
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
                background: phaseId === p.id ? T.tl2 : T.sf,
                border: `1px solid ${phaseId === p.id ? T.tl : T.ln2}`,
                color: phaseId === p.id ? T.tl : T.dm,
                '&:hover': { background: phaseId === p.id ? T.tl2 : T.sf3 },
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.rd }}>
              This workflow has no phases yet — add a schedule before creating deliverables.
            </Box>
          )}
        </Box>
      </Field>
      <Field label="Source — the registered system this artifact lives in">
        <SelectInput
          value={serviceKey}
          onChange={(v) => { setServiceKey(v); setSvcErr(false); }}
          disabled={servicesLoading}
          options={[
            { value: '', label: servicesLoading ? 'Loading…' : 'Select a system' },
            ...(services ?? []).map((s) => ({ value: s.key, label: s.name })),
          ]}
        />
        {svcErr && <Box sx={{ fontSize: 11, color: T.rd, mt: '5px' }}>Pick the system this artifact is registered in.</Box>}
      </Field>
      <Field label="External artifact ID — optional; fill in once it's registered there">
        <TextInput
          value={externalArtifactId}
          onChange={setExternalArtifactId}
          placeholder="e.g. the artifact's id in that system"
        />
      </Field>
      <Field
        label="Artifact key — optional; use the same key when adding this artifact again in another phase"
      >
        <TextInput
          value={artifactKey}
          onChange={(v) => { setArtifactKey(v); setKeyErr(''); }}
          error={!!keyErr}
          placeholder="e.g. PLL_MAIN.DESIGN_REVIEW_PACKAGE"
        />
        {keyErr && <Box sx={{ fontSize: 11, color: T.rd, mt: '5px' }}>{keyErr}</Box>}
      </Field>
      <SirenButton variant="primary" onClick={submit}>
        <Icon name="plus" /> Create
      </SirenButton>
    </ModalShell>
  );
}
