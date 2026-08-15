import { Box, Chip } from '@mui/material';
import { tokens } from '@/theme/theme';

interface TodayLineProps {
  x: number | null;
  height: number;
}

/** 오늘 날짜 인디케이터 - todayX 보간 결과에 세로선으로 표시 (설계서 3.2-6, 7.1). */
export function TodayLine({ x, height }: TodayLineProps) {
  if (x === null) return null;
  return (
    <Box sx={{ position: 'absolute', left: x, top: 0, height, width: 0, zIndex: 6, pointerEvents: 'none' }}>
      <Box sx={{ width: '2px', height: '100%', bgcolor: tokens.todayBorder }} />
      <Chip
        label="Today"
        size="small"
        sx={{
          position: 'absolute',
          top: 0,
          left: -20,
          height: 16,
          fontSize: 10,
          bgcolor: tokens.todayBorder,
          color: '#fff',
        }}
      />
    </Box>
  );
}
