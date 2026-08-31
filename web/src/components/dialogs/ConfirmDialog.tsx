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
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 파괴적 동작(삭제/권한 제거) 전 확인 — ko/en 문구는 호출부에서 t()로 넘긴다. */
export function ConfirmDialog({
  title, message, warning, confirmLabel, cancelLabel, danger = true, busy, onCancel, onConfirm,
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
            color: T.rd, background: T.rd2, border: `1px solid ${T.rd3}`, borderRadius: '8px',
            padding: '9px 11px', mb: '16px',
          }}
        >
          <Icon name="warn" size={14} />
          <span>{warning}</span>
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <SirenButton variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </SirenButton>
        <SirenButton
          variant={danger ? 'default' : 'primary'}
          onClick={onConfirm}
          disabled={busy}
          sx={danger ? { background: T.rd, color: '#fff', border: '1px solid transparent' } : undefined}
        >
          <Icon name={danger ? 'trash' : 'check'} /> {confirmLabel}
        </SirenButton>
      </Box>
    </ModalShell>
  );
}
