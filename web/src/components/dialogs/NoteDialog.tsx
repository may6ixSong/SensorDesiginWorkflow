import { useState } from 'react';
import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Ey, Field, TextArea } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  text: string;
  onClose: () => void;
  onSave: (text: string) => void;
  onDelete: () => void;
}

/** 목업 noteDlgH() — 메모 편집 */
export function NoteDialog({ text, onClose, onSave, onDelete }: Props) {
  const [v, setV] = useState(text);
  return (
    <ModalShell
      open
      onClose={onClose}
      width={400}
      header={
        <>
          <Ey>MEMO</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Memo</Box>
        </>
      }
    >
      <Field label="Content">
        <TextArea value={v} onChange={setV} rows={4} />
      </Field>
      <Box sx={{ display: 'flex', gap: '8px' }}>
        <AcroButton variant="primary" onClick={() => onSave(v)}>
          <Icon name="check" /> Save
        </AcroButton>
        <AcroButton onClick={onDelete} sx={{ color: T.rd }}>
          <Icon name="trash" /> Delete
        </AcroButton>
      </Box>
    </ModalShell>
  );
}
