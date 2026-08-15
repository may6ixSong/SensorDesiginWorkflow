import { Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PhaseRef } from '@/types/domain';
import { isTodayInPhase } from '@/lib/laneGeometry';

interface PhaseInfoDialogProps {
  phase: PhaseRef | null;
  onClose: () => void;
}

/** Phase 상세 정보 (읽기 전용 - 이번 시스템은 Phase를 수정하는 UI가 없다, 설계서 3.2). */
export function PhaseInfoDialog({ phase, onClose }: PhaseInfoDialogProps) {
  return (
    <Dialog open={Boolean(phase)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {phase?.label}
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {phase && (
          <Stack spacing={1}>
            <Typography variant="body2">Phase 코드: {phase.key}</Typography>
            <Typography variant="body2">시작일: {phase.start}</Typography>
            <Typography variant="body2">종료일: {phase.end}</Typography>
            {isTodayInPhase(phase) && (
              <Typography variant="body2" color="warning.main" fontWeight={700}>
                오늘이 포함된 Phase입니다.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Phase는 프로젝트 설정에서 전사 공통으로 관리되며, 이 화면에서는 읽기 전용입니다 (설계서 3.2).
            </Typography>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
