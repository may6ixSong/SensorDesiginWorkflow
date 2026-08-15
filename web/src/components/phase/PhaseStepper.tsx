import { Box, Stack, Typography } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { isTodayInPhase } from '@/lib/laneGeometry';
import { tokens } from '@/theme/theme';

interface PhaseStepperProps {
  phases: PhaseRef[];
  onSelectPhase: (phase: PhaseRef) => void;
}

/** 공통 Phase 읽기 전용 표시, Today 강조 (설계서 3.2, 7.1 컴포넌트 트리). */
export function PhaseStepper({ phases, onSelectPhase }: PhaseStepperProps) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);

  return (
    <Stack direction="row" sx={{ borderBottom: `1px solid ${tokens.border}`, bgcolor: tokens.surface }}>
      {sorted.map((p) => {
        const days = Math.max(
          1,
          Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / 86400000),
        );
        const isToday = isTodayInPhase(p);
        return (
          <Box
            key={p.key}
            onClick={() => onSelectPhase(p)}
            sx={{
              flex: days,
              minWidth: 60,
              textAlign: 'center',
              py: 0.75,
              cursor: 'pointer',
              bgcolor: isToday ? tokens.today : 'transparent',
              borderTop: isToday ? `2px solid ${tokens.todayBorder}` : '2px solid transparent',
              borderRight: `1px solid ${tokens.border}`,
              '&:hover': { bgcolor: tokens.surfaceAlt },
            }}
          >
            <Typography variant="caption" fontWeight={isToday ? 700 : 500} noWrap>
              {p.key}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}
