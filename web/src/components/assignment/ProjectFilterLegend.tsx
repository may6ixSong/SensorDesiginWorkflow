import { Box } from '@mui/material';
import { colorForKnoxId } from '@/app/providers/DirectoryProvider';
import { ProjectDto } from '@/types/domain';
import { CURSOR_POINTER, T } from '@/theme/tokens';

/**
 * project 범례 겸 필터(사용자 요청) — 체크박스를 끄면 달력/목록에서 그 project가 빠진다.
 * 색과 표시 텍스트는 항상 project **name** 기준이다(code 아님, 사용자 확정).
 */
export function ProjectFilterLegend({
  projects, excludedIds, onToggle, direction = 'vertical', dense = false, sx,
}: {
  projects: ProjectDto[];
  excludedIds: Set<string>;
  onToggle: (projectId: string) => void;
  direction?: 'vertical' | 'horizontal';
  dense?: boolean;
  sx?: object;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        flexWrap: direction === 'horizontal' ? 'wrap' : 'nowrap',
        gap: dense ? '4px 10px' : '6px 12px',
        ...sx,
      }}
    >
      {projects.map((p) => {
        const checked = !excludedIds.has(p._id);
        const color = colorForKnoxId(p._id);
        return (
          <Box
            key={p._id}
            component="label"
            title={p.name}
            sx={{
              display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0,
              cursor: CURSOR_POINTER, userSelect: 'none',
              opacity: checked ? 1 : 0.45, transition: 'opacity .12s ease',
            }}
          >
            <Box
              component="input"
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(p._id)}
              sx={{ width: 13, height: 13, accentColor: color, cursor: CURSOR_POINTER, flex: '0 0 auto', margin: 0 }}
            />
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
            <Box
              sx={{
                fontSize: dense ? 10.5 : 11, color: T.tx2, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </Box>
          </Box>
        );
      })}
      {!projects.length && <Box sx={{ fontSize: 10.5, color: T.dm2 }}>No projects</Box>}
    </Box>
  );
}
