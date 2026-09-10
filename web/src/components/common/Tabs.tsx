import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION } from '@/theme/motion';
import { useMotion } from '@/theme/useReducedMotion';
import { CURSOR_POINTER, T } from '@/theme/tokens';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  /** 라벨 오른쪽의 작은 수치(예: 버전 개수) — 없으면 안 그린다. */
  badge?: ReactNode;
}

/**
 * 탭 줄.
 *
 * ★ 밑줄 표시자를 탭마다 따로 그리지 않고 **하나를 layoutId로 옮긴다**(설계서 06장 §1.4).
 *   그래야 탭을 바꿀 때 표시자가 "미끄러져 이동"하고, 어디에서 어디로 갔는지가 보인다.
 *   깜빡 갈아 끼우는 것과 체감이 완전히 다르다.
 */
export function Tabs<K extends string>({
  tabs, value, onChange, sx,
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (k: K) => void;
  sx?: object;
}) {
  const m = useMotion();
  return (
    <Box sx={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${T.ln}`, ...sx }}>
      {tabs.map(({ key, label, badge }) => {
        const on = key === value;
        return (
          <Box
            key={key}
            component="button"
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            sx={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 13px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              color: on ? T.pr : T.dm, background: 'none', border: 'none',
              mb: '-1px', cursor: CURSOR_POINTER,
              transition: 'color .16s ease',
              '&:hover': { color: on ? T.pr : T.tx },
            }}
          >
            {label}
            {badge != null && (
              <Box
                component="span"
                sx={{
                  fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  padding: '3px 5px', borderRadius: '5px',
                  background: on ? T.prSoft : T.sf3, color: on ? T.pr : T.dm2,
                }}
              >
                {badge}
              </Box>
            )}
            {on && (
              <Box
                component={motion.div}
                layoutId="siren-tab-underline"
                transition={m(MOTION.block)}
                sx={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  height: '2px', background: T.pr, borderRadius: '2px 2px 0 0',
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * 탭 본문 — 내용이 바뀔 때 그냥 갈아 끼우지 않고 짧게 교차 전환한다.
 * 높이가 크게 달라지는 탭이 많아 위치까지 움직이면 산만해지므로, y는 아주 작게만 준다.
 */
export function TabPanel({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  const m = useMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={m(MOTION.fade)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
