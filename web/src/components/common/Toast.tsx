import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useToastStore } from '@/store/toastStore';
import { T } from '@/theme/tokens';

/** 목업 .toast — 하단 중앙, 1.9초 후 사라짐. */
export function Toast() {
  const msg = useToastStore((s) => s.msg);
  const seq = useToastStore((s) => s.seq);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!msg) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1900);
    return () => clearTimeout(t);
  }, [msg, seq]);

  return (
    <Box
      sx={{
        position: 'fixed',
        left: '50%',
        bottom: 22,
        transform: visible ? 'translateX(-50%) translateY(-4px)' : 'translateX(-50%)',
        background: T.tx,
        color: '#fff',
        fontSize: 12.5,
        px: '15px',
        py: '8px',
        borderRadius: '8px',
        boxShadow: T.sl,
        zIndex: 1600,
        opacity: visible ? 1 : 0,
        transition: 'opacity .18s, transform .18s',
        pointerEvents: 'none',
      }}
    >
      {msg}
    </Box>
  );
}
