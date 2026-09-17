import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoVersionView } from '@/api/calypsoClient';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, TextInput } from '@/components/common/Panel';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  version: CalypsoVersionView;
  submitting: boolean;
  onConfirm: (versionNote: string, description: string) => void;
  onClose: () => void;
}

/**
 * Version tree에서 released 아닌 minor 하나를 골라 publish하는 확인창(사용자 요청) —
 * 그 minor 자신은 그대로 남고, 그 데이터로 새 published 버전(major +1)이 하나 더
 * 생긴다. 어느 minor를 고르든 항상 최신 major 다음 번호를 받는다. 이 새 published
 * 버전 자신의 Version Note/Description은 여기서 새로 받는다 — source minor의 것을
 * 그대로 베끼지 않는다.
 */
export function PublishVersionDialog({ version, submitting, onConfirm, onClose }: Props) {
  const [versionNote, setVersionNote] = useState('');
  const [description, setDescription] = useState('');
  const [noteErr, setNoteErr] = useState(false);

  const submit = () => {
    if (!versionNote.trim()) { setNoteErr(true); return; }
    onConfirm(versionNote.trim(), description);
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={1150}
      header={
        <>
          <Box sx={{ fontSize: 11, color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            v{version.versionLabel}
          </Box>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Publish this version</Box>
        </>
      }
      footer={
        <SirenButton
          variant="primary"
          disabled={submitting}
          onClick={submit}
          sx={{ color: T.pr, borderColor: T.prLine }}
        >
          <Icon name="send" /> {submitting ? 'Publishing…' : 'Publish'}
        </SirenButton>
      }
    >
      <Box sx={{ fontSize: 11.5, color: T.dm2, lineHeight: 1.6, mb: '16px' }}>
        This creates a new published version using v{version.versionLabel}&apos;s content — v{version.versionLabel}
        {' '}itself stays exactly as it is.
      </Box>
      <Field label="Version Note — required, a short one-line summary">
        <TextInput
          value={versionNote}
          onChange={(v) => { setVersionNote(v); setNoteErr(false); }}
          error={noteErr}
          placeholder="What's in this release"
        />
      </Field>
      <Field label="Description — optional">
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Longer details, if any"
          minHeight={220}
          maxHeight={220}
        />
      </Field>
    </ModalShell>
  );
}
