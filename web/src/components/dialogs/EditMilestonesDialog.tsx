import { Box } from '@mui/material';
import { Milestone } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { Ey } from '@/components/common/Panel';
import { ScheduleDraft, ScheduleEditor } from './ScheduleEditor';
import { T } from '@/theme/tokens';

interface Props {
  milestones: Milestone[];
  onClose: () => void;
  onSave: (milestones: ScheduleDraft[]) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * Project Information의 "Edit milestones" — 과제 공통 일정을 고친다.
 *
 * 여기서 고치는 것은 **과제 일정**이지 어느 workflow의 일정이 아니다. 이미 만들어진
 * workflow는 생성 시점에 이 목록을 복사해 자기 것으로 들고 있으므로 여기를 바꿔도
 * 따라 바뀌지 않는다 — 새로 만드는 workflow의 기본값과, 타임라인/3D 뷰의 배경 구간이
 * 달라질 뿐이다. 그 점을 화면에서 한 줄로 못박아 둔다.
 */
export function EditMilestonesDialog({ milestones, onClose, onSave, saving, error }: Props) {
  return (
    <ModalShell
      open
      onClose={onClose}
      width={660}
      header={
        <>
          <Ey>Project schedule</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Milestones</Box>
        </>
      }
    >
      <Box
        sx={{
          fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
          borderRadius: '9px', padding: '9px 11px', mb: '14px', lineHeight: 1.7,
        }}
      >
        These are the project's shared milestones. Workflows that already exist keep the schedule they
        own — changing this list only affects new workflows (which start as a copy of it) and the date
        axis on the timeline and 3D view.
      </Box>
      <ScheduleEditor
        spans={milestones}
        noun="milestone"
        onSubmit={onSave}
        saving={saving}
        error={error}
      />
    </ModalShell>
  );
}
