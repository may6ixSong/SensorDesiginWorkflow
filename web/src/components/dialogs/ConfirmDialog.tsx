import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  title: string;
  message: string;
  /** 위험 강조 문구 (예: "이 작업은 되돌릴 수 없습니다") — 선택. */
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * 파괴적 동작이면 true(기본) — 확인 버튼이 붉은색 + 휴지통 아이콘이 된다.
   * 저장처럼 되돌릴 수 있는 동작에는 false를 준다.
   */
  danger?: boolean;
  busy?: boolean;
  /**
   * 문구만으로 부족할 때 끼워 넣는 블록 — 예를 들어 workflow 부서 변경 시의 주황색
   * 경고처럼, "무엇이 무엇으로 바뀌는지"를 함께 보여줘야 하는 경우다.
   */
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 되돌릴 수 없거나 영향이 큰 동작 전 확인 — ko/en 문구는 호출부에서 t()로 넘긴다. */
export function ConfirmDialog({
  title, message, warning, confirmLabel, cancelLabel, danger = true, busy, children, onCancel, onConfirm,
}: Props) {
  return (
    <ModalShell
      open
      onClose={() => { if (!busy) onCancel(); }}
      width={420}
      header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Box>}
    >
      <Box sx={{ fontSize: 13, color: T.tx, lineHeight: 1.6, mb: warning ? '10px' : '16px' }}>{message}</Box>
      {warning && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 12, lineHeight: 1.6,
            color: T.danger, background: T.dangerSoft, border: `1px solid ${T.dangerLine}`, borderRadius: '8px',
            padding: '9px 11px', mb: '16px',
          }}
        >
          <Icon name="warn" size={14} />
          <span>{warning}</span>
        </Box>
      )}
      {children}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', mt: children ? '16px' : 0 }}>
        <SirenButton variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel ?? 'Cancel'}
        </SirenButton>
        <SirenButton
          variant={danger ? 'default' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
          sx={danger ? { background: T.danger, color: '#fff', border: '1px solid transparent' } : undefined}
        >
          <Icon name={danger ? 'trash' : 'check'} /> {confirmLabel}
        </SirenButton>
      </Box>
    </ModalShell>
  );
}
