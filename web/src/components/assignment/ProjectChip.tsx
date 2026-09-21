import { Box } from '@mui/material';
import { colorForKnoxId } from '@/app/providers/DirectoryProvider';
import { withAlpha } from '@/lib/domainWorkflow';

/**
 * project 식별용 칩 — 색은 project 단위로 결정적이다(colorForKnoxId는 어떤 문자열이든
 * 같은 색을 낸다, 여기서는 projectId를 넣는다). department 배지보다 눈에 띄어야 한다는
 * 요구(사용자 확정)라 굵은 글씨 + 옅게 tint한 배경을 쓴다.
 */
export function ProjectChip({
  projectId, name, size = 'md',
}: {
  projectId: string;
  name: string;
  size?: 'sm' | 'md';
}) {
  const color = colorForKnoxId(projectId);
  return (
    <Box
      title={name}
      sx={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: size === 'sm' ? 10.5 : 11.5, fontWeight: 800,
        padding: size === 'sm' ? '2px 8px' : '3px 9px',
        borderRadius: '999px', color,
        background: withAlpha(color, 0.14),
        border: `1px solid ${withAlpha(color, 0.4)}`,
        whiteSpace: 'nowrap', minWidth: 0, maxWidth: 200,
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {name}
    </Box>
  );
}
