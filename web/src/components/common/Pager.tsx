import { Box } from '@mui/material';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/**
 * 목록 하단의 페이지 이동 바 — "N–M / total" 표시 + 이전/다음. My Assignment의 release
 * 패널(서버 페이지네이션)과 artifact 패널(클라이언트 페이지네이션)이 함께 쓴다.
 */
export function Pager({
  page, size, total, hasMore, onPrev, onNext,
}: {
  page: number;
  size: number;
  total: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 0) return null;
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 13px', borderTop: `1px solid ${T.ln}`, background: T.sf2,
      }}
    >
      <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>
        {(page - 1) * size + 1}–{Math.min(page * size, total)} / {total}
      </Box>
      <Box sx={{ flex: 1 }} />
      <PagerButton label="Previous page" disabled={page <= 1} onClick={onPrev}>‹</PagerButton>
      <PagerButton label="Next page" disabled={!hasMore} onClick={onNext}>›</PagerButton>
    </Box>
  );
}

function PagerButton({
  disabled, onClick, label, children,
}: {
  disabled: boolean; onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      sx={{
        display: 'grid', placeItems: 'center', width: 26, height: 24,
        border: `1px solid ${T.ln2}`, borderRadius: '7px', background: T.sf,
        color: disabled ? T.dm2 : T.tx, opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : CURSOR_POINTER, fontFamily: 'inherit',
        fontSize: 15, lineHeight: 1, paddingBottom: '2px',
        '&:hover': disabled ? {} : { background: T.sf3 },
      }}
    >
      {children}
    </Box>
  );
}
