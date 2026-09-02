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
  /** 만드는 사람이 이 과제에서 실제로 속한 부서 — workflow의 domain은 이 중 하나여야 한다. */
  myDepartments: string[];
  /** 만드는 사람이 admin인지 — 소속 부서가 없어도 admin이면 unassigned로 만들 수 있다. */
  isAdmin: boolean;
  /** 새 workflow가 물려받을 과제 공통 일정 — 무엇이 복사되는지 미리 보여 준다. */
  milestones: Milestone[];
  onClose: () => void;
  onCreate: (p: { name: string; domain: string; creatorIsAdmin: boolean; description: string }) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * workflow를 새로 만든다.
 *
 * 일정은 여기서 정하지 않는다 — 만들어질 때 과제 마일스톤이 그대로 복사되고(사용자 요청:
 * "default로는 과제의 milestone이 들어가고"), 그 뒤에 이 workflow의 "Edit phases"에서
 * 자유롭게 고친다. 그래서 무엇이 복사되는지만 미리 보여 준다.
 *
 * domain(부서)은 예전처럼 자유 선택이 아니다 — 만드는 사람이 이 과제에서 실제로 속한
 * 부서 중 하나로만 정해진다: 부서가 하나면 자동으로 그 값, 여러 개면 그중 하나를 고르는
 * picker, 하나도 없으면(그리고 admin이 아니면) 애초에 workflow를 만들 수 없다 — admin은
 * 예외로 unassigned로 만들 수 있다.
 */
export function CreateWorkflowDialog({
  myDepartments, isAdmin, milestones, onClose, onCreate, saving, error,
}: Props) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState(myDepartments[0] ?? '');
  const [description, setDescription] = useState('');
  const [nameErr, setNameErr] = useState(false);

  const blocked = myDepartments.length === 0 && !isAdmin;

  const submit = () => {
    if (blocked) return;
    if (!name.trim()) { setNameErr(true); return; }
    onCreate({
      name: name.trim(),
      domain: myDepartments.length > 0 ? domain : '',
      creatorIsAdmin: isAdmin,
      description: description.trim(),
    });
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
      {blocked ? (
        <Box
          sx={{
            fontSize: 12, color: T.rd, background: T.rd2, border: `1px solid ${T.rd3}`,
            borderRadius: '9px', padding: '10px 12px', mb: '14px', lineHeight: 1.6,
          }}
        >
          You don't belong to any department in this project yet, so you can't create a workflow.
          Ask a project manager to add you to a department first.
        </Box>
      ) : (
        <>
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(v) => { setName(v); setNameErr(false); }}
              error={nameErr}
              placeholder="e.g. ADC_RAMP"
            />
          </Field>
          {myDepartments.length > 1 ? (
            <Field label="Department">
              <SelectInput value={domain} onChange={setDomain} options={myDepartments.map((d) => ({ value: d, label: d }))} />
            </Field>
          ) : (
            <Field label="Department">
              <Box sx={{ fontSize: 13, padding: '8px 0', color: myDepartments.length ? T.tx : T.dm2 }}>
                {myDepartments.length ? myDepartments[0] : 'Unassigned (you have no department in this project)'}
              </Box>
            </Field>
          )}
          <Field label="Description">
            <TextInput value={description} onChange={setDescription} placeholder="One line about what this workflow covers" />
          </Field>
        </>
      )}

      {!blocked && (
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
      )}

      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mb: '10px' }}>{error}</Box>}

      {!blocked && (
        <SirenButton variant="primary" onClick={submit} disabled={saving}>
          <Icon name="plus" /> {saving ? 'Creating…' : 'Create workflow'}
        </SirenButton>
      )}
    </ModalShell>
  );
}
