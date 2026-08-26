import { useState } from 'react';
import { Box } from '@mui/material';
import { Milestone } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { shortDate } from '@/lib/schedule';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  /** 이 과제에 등록된 설계 도메인 목록 — workflow는 반드시 이 중 하나(또는 미지정)에 속한다. */
  workflowDomains: string[];
  /** 새 workflow가 물려받을 과제 공통 일정 — 무엇이 복사되는지 미리 보여 준다. */
  milestones: Milestone[];
  /** 목록에서 도메인을 눌러 들어왔으면 그 값이 기본 선택된다. */
  defaultDomain?: string;
  onClose: () => void;
  onCreate: (p: { name: string; domain: string; description: string }) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * 도메인 아래에 workflow를 새로 만든다.
 *
 * 일정은 여기서 정하지 않는다 — 만들어질 때 과제 마일스톤이 그대로 복사되고(사용자 요청:
 * "default로는 과제의 milestone이 들어가고"), 그 뒤에 이 workflow의 "Edit phases"에서
 * 자유롭게 고친다. 그래서 무엇이 복사되는지만 미리 보여 준다.
 */
export function CreateWorkflowDialog({
  workflowDomains, milestones, defaultDomain, onClose, onCreate, saving, error,
}: Props) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState(defaultDomain ?? workflowDomains[0] ?? '');
  const [description, setDescription] = useState('');
  const [nameErr, setNameErr] = useState(false);

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    onCreate({ name: name.trim(), domain, description: description.trim() });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={520}
      header={
        <>
          <Ey>New workflow</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Create Workflow</Box>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
          placeholder="e.g. ADC_RAMP"
        />
      </Field>
      <Field label="Design domain">
        <SelectInput
          value={domain}
          onChange={setDomain}
          options={[
            { value: '', label: 'Unassigned' },
            ...workflowDomains.map((d) => ({ value: d, label: d })),
          ]}
        />
      </Field>
      <Field label="Description">
        <TextInput value={description} onChange={setDescription} placeholder="One line about what this workflow covers" />
      </Field>

      <Box
        sx={{
          background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '9px',
          padding: '10px 12px', mb: '14px',
        }}
      >
        <Ey sx={{ mb: '7px' }}>Starting schedule · copied from the project milestones</Ey>
        {milestones.length ? (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {milestones.map((m) => (
                <Box
                  key={m.id}
                  title={`${shortDate(m.start)} → ${shortDate(m.end)}`}
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 10.5, padding: '3px 8px', borderRadius: '6px',
                    background: T.sf, border: `1px solid ${T.ln2}`, color: T.dm,
                  }}
                >
                  {m.name}
                </Box>
              ))}
            </Box>
            <Box sx={{ fontSize: 11, color: T.dm2, mt: '8px', lineHeight: 1.6 }}>
              These become this workflow's own phases. Change them any time from the board — the project
              milestones stay untouched.
            </Box>
          </>
        ) : (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>
            This project has no milestones yet, so the workflow starts with an empty schedule.
          </Box>
        )}
      </Box>

      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mb: '10px' }}>{error}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="plus" /> {saving ? 'Creating…' : 'Create workflow'}
      </SirenButton>
    </ModalShell>
  );
}
