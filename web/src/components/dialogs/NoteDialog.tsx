import { useState } from 'react';
import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { DEFAULT_MEMO_COLOR, MEMO_COLORS, MemoColor, memoColorTokens, normalizeMemoColor } from '@/lib/memoColors';
import { CURSOR_POINTER, R, T } from '@/theme/tokens';

interface Props {
  text: string;
  /** 저장된 색이 없으면(기존 데이터) 기본색(yellow)으로 미리 골라 둔다(사용자 요청). */
  color?: string | null;
  onClose: () => void;
  onSave: (text: string, color: MemoColor) => void;
  onDelete: () => void;
}

/** 목업 noteDlgH() — 메모 편집. 다이얼로그 크기를 키우고 배경색 선택을 추가했다(사용자 요청). */
export function NoteDialog({ text, color, onClose, onSave, onDelete }: Props) {
  const [v, setV] = useState(text);
  const [c, setC] = useState<MemoColor>(normalizeMemoColor(color ?? DEFAULT_MEMO_COLOR));

  return (
    <ModalShell
      open
      onClose={onClose}
      width={620}
      header={
        <>
          <Ey>MEMO</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Memo</Box>
        </>
      }
    >
      <Field label="Content">
        <Box
          component="textarea"
          value={v}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setV(e.target.value)}
          rows={8}
          sx={{
            width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 18,
            lineHeight: 1.5, padding: '10px 12px', borderRadius: `${R.sm}px`,
            background: T.sf, color: T.tx, border: `1px solid ${T.ln2}`, outline: 'none',
            '&:focus': { borderColor: T.pr, boxShadow: `0 0 0 3px ${T.prSoft}` },
          }}
        />
      </Field>

      <Field label="Color">
        <Box sx={{ display: 'flex', gap: '9px' }}>
          {MEMO_COLORS.map((mc) => {
            const swatch = memoColorTokens(mc);
            const on = c === mc;
            return (
              <Box
                key={mc}
                component="button"
                type="button"
                onClick={() => setC(mc)}
                title={mc}
                aria-label={mc}
                sx={{
                  width: 30, height: 30, borderRadius: '50%', cursor: CURSOR_POINTER,
                  background: swatch.bg,
                  border: `2px solid ${on ? T.pr : swatch.line}`,
                  boxShadow: on ? `0 0 0 3px ${T.prSoft}` : 'none',
                  transition: 'box-shadow .14s, border-color .14s',
                }}
              />
            );
          })}
        </Box>
      </Field>

      <Box sx={{ display: 'flex', gap: '8px' }}>
        <SirenButton variant="primary" onClick={() => onSave(v, c)}>
          <Icon name="check" /> Save
        </SirenButton>
        <SirenButton onClick={onDelete} sx={{ color: T.danger }}>
          <Icon name="trash" /> Delete
        </SirenButton>
      </Box>
    </ModalShell>
  );
}
