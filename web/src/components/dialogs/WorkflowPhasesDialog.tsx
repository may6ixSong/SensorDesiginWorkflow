import { Box } from '@mui/material';
import { Milestone, WorkflowPhase } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { ScheduleDraft, ScheduleEditor } from './ScheduleEditor';
import { T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  phases: WorkflowPhase[];
  /** 과제 공통 일정 — "Reset to project milestones" 버튼이 이 값을 그대로 밀어 넣는다. */
  milestones: Milestone[];
  /** 지금 이 workflow에서 일정을 잃은 산출물 수 — 0보다 크면 경고를 띄운다. */
  orphanCount: number;
  onClose: () => void;
  onSave: (phases: ScheduleDraft[]) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * 이 workflow만의 일정 편집.
 *
 * 과제 마일스톤과 다른 점을 화면에서 분명히 해야 한다: 여기서 지운 칸을 가리키던
 * 산출물은 **사라지지 않고** 캔버스의 원래 자리에 "릴리즈 일정 없음"으로 남는다.
 * 그래서 저장 전에 그 결과를 미리 경고하고, 이미 그런 산출물이 있으면 개수를 알려 준다.
 */
export function WorkflowPhasesDialog({
  workflowName, phases, milestones, orphanCount, onClose, onSave, saving, error,
}: Props) {
  return (
    <ModalShell
      open
      onClose={onClose}
      width={680}
      header={
        <>
          <Ey>{workflowName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Phases</Box>
        </>
      }
    >
      <Box
        sx={{
          fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
          borderRadius: '9px', padding: '9px 11px', mb: '12px', lineHeight: 1.7,
        }}
      >
        This schedule belongs to this workflow alone — every workflow can have a different one.
        Removing a phase never deletes its artifacts: they stay exactly where they are on the canvas
        and get flagged as having no release schedule until you give them one.
      </Box>

      {orphanCount > 0 && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: 11.5, color: T.rd, background: T.rd2, border: `1px solid ${T.rd3}`,
            borderRadius: '9px', padding: '9px 11px', mb: '14px',
          }}
        >
          <Icon name="warn" size={13} />
          {orphanCount} artifact{orphanCount > 1 ? 's' : ''} in this workflow already {orphanCount > 1 ? 'have' : 'has'} no
          release schedule. Re-adding a phase with the same dates won't re-attach them — assign them from the
          artifact's Release schedule.
        </Box>
      )}

      <ScheduleEditor
        spans={phases}
        noun="phase"
        onSubmit={onSave}
        saving={saving}
        error={error}
        extraAction={
          milestones.length > 0 ? (
            <SirenButton
              title="Replace this workflow's schedule with a fresh copy of the project milestones"
              onClick={() => onSave(milestones.map((m) => ({ name: m.name, start: m.start, end: m.end })))}
              disabled={saving}
            >
              <Icon name="undo" /> Reset to project milestones
            </SirenButton>
          ) : null
        }
      />
    </ModalShell>
  );
}
