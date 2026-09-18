import { Box } from '@mui/material';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * 실물을 다시 찾아갈 수단 — 링크(OA)든 경로(HPC)든 그때 기록된 값 그대로다(05장 §5).
 * release 상세와 버전 event 다이얼로그가 함께 쓴다.
 */
export function Location({ viewUrl, hpcPath }: { viewUrl: string | null; hpcPath: string | null }) {
  if (viewUrl) {
    return (
      <Box
        component="a"
        href={viewUrl}
        target="_blank"
        rel="noreferrer"
        sx={{ fontSize: 10.5, color: T.pr, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
      >
        Open in service ↗
      </Box>
    );
  }
  if (hpcPath) {
    return (
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, overflowWrap: 'anywhere', mt: '2px' }}>
        {hpcPath}
      </Box>
    );
  }
  return null;
}
