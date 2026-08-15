import { Box, Paper, Stack, Typography } from '@mui/material';
import { tokens } from '@/theme/theme';

const ITEMS: { label: string; color: string }[] = [
  { label: 'OA', color: tokens.networkOA },
  { label: 'HPC', color: tokens.networkHPC },
  { label: '일반 flow', color: tokens.edgeDefault },
  { label: '양방향 flow', color: tokens.edgeBidirectional },
  { label: '하이라이트', color: tokens.edgeHighlight },
];

/** 우하단 범례 (설계서 7.1 컴포넌트 트리). */
export function Legend() {
  return (
    <Paper
      elevation={2}
      sx={{ position: 'absolute', right: 12, bottom: 12, p: 1, borderRadius: 2, zIndex: 7 }}
    >
      <Stack spacing={0.5}>
        {ITEMS.map((item) => (
          <Stack key={item.label} direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
            <Typography variant="caption">{item.label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
