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
  /**
   * 고를 수 있는 부서 — "내가 이 과제에서 속한 부서"다(Admin이면 과제 전체 부서).
   * 호출부가 lib/access.ts의 myDepartments()로 계산해 넘긴다.
   */
  myDepartments: string[];
  /** 새 workflow가 물려받을 과제 공통 일정 — 무엇이 복사되는지 미리 보여 준다. */
  milestones: Milestone[];
  onClose: () => void;
  onCreate: (p: { name: string; department: string; description: string }) => void;
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
 * Department는 **필수**이며 'unassigned'는 없다(설계서 README §3.2).
 *
 * ★ dropdown은 **부서가 하나뿐이어도 항상 노출한다** — 무엇이 선택되었는지 늘 같은
 *   자리에서 보여야 하기 때문이다. 값이 하나면 자동 선택된 채로 비활성으로 둔다.
 * ★ 후보는 "내가 이 과제에서 속한 부서"뿐이다. 하나도 없으면 workflow를 만들 수 없다
 *   (Admin은 과제 전체 부서를 갖는 것으로 계산되므로 이 경우에 걸리지 않는다).
 */
export function CreateWorkflowDialog({
  myDepartments, milestones, onClose, onCreate, saving, error,
}: Props) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState(myDepartments[0] ?? '');
  const [description, setDescription] = useState('');
  const [nameErr, setNameErr] = useState(false);

  const blocked = myDepartments.length === 0;

  const submit = () => {
    if (blocked) return;
    if (!name.trim()) { setNameErr(true); return; }
    onCreate({ name: name.trim(), department, description: description.trim() });
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
            fontSize: 12, color: T.danger, background: T.dangerSoft, border: `1px solid ${T.dangerLine}`,
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
          {/* 부서가 하나뿐이어도 dropdown을 그대로 둔다 — 선택된 값이 늘 같은 자리에
              보여야 하고, 나중에 부서가 늘어도 화면이 달라지지 않는다. */}
          <Field label="Department">
            <SelectInput
              value={department}
              onChange={setDepartment}
              disabled={myDepartments.length === 1}
              options={myDepartments.map((d) => ({ value: d, label: d }))}
            />
          </Field>
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

      {error && <Box sx={{ fontSize: 11.5, color: T.danger, mb: '10px' }}>{error}</Box>}

      {!blocked && (
        <SirenButton variant="primary" onClick={submit} disabled={saving}>
          <Icon name="plus" /> {saving ? 'Creating…' : 'Create workflow'}
        </SirenButton>
      )}
    </ModalShell>
  );
}
