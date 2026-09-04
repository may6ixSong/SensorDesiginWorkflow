import { ReactNode, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { T } from '@/theme/tokens';
import { SirenButton } from './SirenButton';
import { Icon } from './Icon';

/** 열림 애니메이션 길이 — 너무 길지 않게(사용자 요청) 짧고 또렷하게. */
const SLIDE_MS = 220;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * 뷰포트 대비 패널 폭. 기본 62vw — 화면의 1/2~2/3 사이(사용자 요청)로, 캔버스가
   * 왼쪽에 계속 보여서 "어느 산출물을 열어 둔 것인지" 맥락이 끊기지 않는다.
   */
  width?: string;
  header: ReactNode;
  children: ReactNode;
  /** 본문 스크롤과 무관하게 패널 하단에 고정되는 영역. */
  footer?: ReactNode;
}

/**
 * 우측에서 밀려 나오는 상세 패널. 산출물 상세처럼 "본문(내용)과 메타데이터를 나란히"
 * 봐야 하는 화면은 가운데 모달로 띄우면 폭이 모자라서, 캔버스를 덮지 않고 옆으로
 * 붙는 이 패널을 쓴다 (설계서 7.1의 모달 계열 컴포넌트에 추가).
 */
export function SlidePanel({ open, onClose, width = '62vw', header, children, footer }: Props) {
  /**
   * open은 mount 시점부터 이미 true로 들어온다(호출부가 `{node && <Dialog/>}`로
   * 조건부 렌더하기 때문) — 그래서 open을 그대로 transform에 쓰면 첫 프레임부터
   * translateX(0)로 그려져 트랜지션이 일어날 시간이 없다(실측 확인된 버그). entered를
   * 따로 두고 mount 다음 프레임에 true로 올려서, 그 사이에 CSS 트랜지션이 걸리게 한다.
   */
  const [entered, setEntered] = useState(false);
  const raf2Ref = useRef<number>();
  useEffect(() => {
    if (!open) { setEntered(false); return undefined; }
    const raf1 = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Box
      sx={{
        position: 'fixed', inset: 0, zIndex: 1300,
        pointerEvents: entered ? 'auto' : 'none',
      }}
    >
      <Box
        onClick={onClose}
        sx={{
          position: 'absolute', inset: 0, background: T.backdrop,
          opacity: entered ? 1 : 0, transition: `opacity ${SLIDE_MS}ms ease`,
        }}
      />
      <Box
        sx={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width, maxWidth: '96vw', minWidth: 'min(760px, 96vw)',
          background: T.sf2,
          borderLeft: `1px solid ${T.ln}`,
          boxShadow: T.shadowDialog,
          display: 'flex', flexDirection: 'column',
          transform: entered ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform ${SLIDE_MS}ms cubic-bezier(.22,.9,.3,1)`,
        }}
      >
        <Box
          sx={{
            flex: '0 0 auto', padding: '15px 20px',
            background: T.sf, borderBottom: `1px solid ${T.ln}`,
            display: 'flex', alignItems: 'flex-start', gap: '10px',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>{header}</Box>
          <SirenButton variant="ghost" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </SirenButton>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</Box>

        {footer && (
          <Box
            sx={{
              flex: '0 0 auto', padding: '12px 20px',
              borderTop: `1px solid ${T.ln}`, background: T.sf,
            }}
          >
            {footer}
          </Box>
        )}
      </Box>
    </Box>
  );
}
