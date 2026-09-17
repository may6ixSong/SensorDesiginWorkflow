import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoVersionView } from '@/api/calypsoClient';
import { ModalShell } from '@/components/common/ModalShell';
import { Field } from '@/components/common/Panel';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  version: CalypsoVersionView;
  submitting: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}

/**
 * Version tree에서 released 아닌 minor 하나를 골라 publish하는 확인창(사용자 요청) —
 * 그 minor 자신은 그대로 남고, 그 데이터로 새 published 버전(major +1)이 하나 더
 * 생긴다. 어느 minor를 고르든 항상 최신 major 다음 번호를 받는다.
 */
export function PublishVersionDialog({ version, submitting, onConfirm, onClose }: Props) {
  const [note, setNote] = useState('');
  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
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
          onClick={() => onConfirm(note)}
          sx={{ color: T.pr, borderColor: T.prLine }}
        >
          <Icon name="send" /> {submitting ? 'Publishing…' : 'Publish'}
        </SirenButton>
      }
    >
      <Box sx={{ fontSize: 11.5, color: T.dm2, lineHeight: 1.6, mb: '14px' }}>
        This creates a new published version using v{version.versionLabel}&apos;s content — v{version.versionLabel}
        {' '}itself stays exactly as it is.
      </Box>
      <Field label="Release note — optional">
        <RichTextEditor value={note} onChange={setNote} placeholder="What's in this release" minHeight={100} />
      </Field>
    </ModalShell>
  );
}
