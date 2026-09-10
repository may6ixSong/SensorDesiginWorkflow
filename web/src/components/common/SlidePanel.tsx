import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { T } from '@/theme/tokens';
import { SirenButton } from './SirenButton';
import { Icon } from './Icon';

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
 * 붙는 이 패널을 쓴다.
 *
 * ★ 닫힘 애니메이션을 **여기서 직접 소유한다**.
 *   호출부는 전부 `{node && <ArtifactSlide/>}` 꼴이라 onClose가 불리는 즉시 언마운트되고,
 *   그러면 나가는 모션이 통째로 잘린다. 그래서 여기서 먼저 exit를 재생하고, 그게 끝난
 *   다음에야 부모의 onClose를 부른다 — 호출부는 아무것도 바꾸지 않아도 된다.
 */
export function SlidePanel({ open, onClose, width = '62vw', header, children, footer }: Props) {
  const m = useMotion();
  const [shown, setShown] = useState(open);

  useEffect(() => { setShown(open); }, [open]);

  /** 닫기 요청 — 실제 언마운트(부모 onClose)는 exit가 끝난 뒤다. */
  const requestClose = useCallback(() => setShown(false), []);

  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, requestClose]);

  return (
    <AnimatePresence onExitComplete={onClose}>
      {shown && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300 }}>
          <Box
            component={motion.div}
            onClick={requestClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={m(MOTION.fade)}
            sx={{ position: 'absolute', inset: 0, background: T.backdrop }}
          />
          <Box
            component={motion.div}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={m(MOTION.panel)}
            sx={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              // minWidth가 width보다 크면 호출부가 준 폭이 무시된다 — 하한은 "너무 좁아
              // 읽을 수 없는" 선(420px)까지만 둔다.
              width, maxWidth: '96vw', minWidth: 'min(420px, 96vw)',
              background: T.sf2,
              borderLeft: `1px solid ${T.ln}`,
              boxShadow: T.shXl,
              display: 'flex', flexDirection: 'column',
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
              <SirenButton variant="ghost" onClick={requestClose} aria-label="Close">
                <Icon name="x" />
              </SirenButton>
            </Box>

            {/* 본문은 한 줄로 늘어놓는 곳이 아니라 위에서 아래로 쌓는 곳이다 —
                호출부가 padding까지 따로 신경 쓰지 않도록 여기서 함께 준다. */}
            <Box
              sx={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                display: 'flex', flexDirection: 'column',
                padding: '16px 20px 22px',
              }}
            >
              {children}
            </Box>

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
      )}
    </AnimatePresence>
  );
}
