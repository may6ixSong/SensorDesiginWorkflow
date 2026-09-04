import { useState } from 'react';
import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useActingAsStore } from '@/store/actingAsStore';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { T, FONT_MONO } from '@/theme/tokens';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 사용자 시뮬레이터 (§13.1) — 헤더의 Admin 메뉴에서 연다. 권한이 workflow별·산출물별로
 * 갈리므로 같은 부서 안에서도 사용자마다 화면이 다르다. 버그 진단 시 그 사람의 화면
 * 상태를 그대로 재현하기 위한 도구다.
 */
export function UserSimulatorDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const actingAs = useActingAsStore((s) => s.actingAs);
  const apply = useActingAsStore((s) => s.apply);
  const [target, setTarget] = useState('');

  const view = (knoxId: string | null) => {
    apply(knoxId);
    // 시점이 바뀌면 캐시된 응답은 전부 다른 사람 기준이라 버린다.
    qc.clear();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width={420}
      header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>User Simulator</Box>}
    >
      <Box sx={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <Box
          component="input"
          value={target}
          placeholder="KnoxID"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTarget(e.target.value)}
          sx={{
            flex: 1, height: 34, px: '10px',
            border: `1px solid ${T.ln}`, borderRadius: '7px',
            background: T.sf, color: T.tx, fontSize: 13, outline: 'none',
            '&:focus': { borderColor: T.tl },
          }}
        />
        <SirenButton variant="primary" onClick={() => target.trim() && view(target.trim())}>
          View as
        </SirenButton>
      </Box>
      {/*
        시뮬레이션 중임을 항상 보이게 둔다 (§13.3 규칙 5) — Admin이 자기 권한과
        착각하지 않도록. 이건 시스템 설명이 아니라 현재 상태 표시라 §14.1의 예외다.
      */}
      {actingAs && (
        <Box
          sx={{
            mt: '12px', p: '9px 12px', borderRadius: '7px',
            border: `1px solid ${T.am2}`, background: T.am3,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          }}
        >
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, color: T.am }}>Viewing as {actingAs}</Box>
          <SirenButton onClick={() => view(null)}>Stop</SirenButton>
        </Box>
      )}
    </ModalShell>
  );
}
