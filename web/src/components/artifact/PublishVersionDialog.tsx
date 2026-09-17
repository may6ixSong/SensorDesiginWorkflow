import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoArtifact, CalypsoVersionView } from '@/api/calypsoClient';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, TextInput } from '@/components/common/Panel';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

/** latestVersion.versionLabel("major.minor")에서 다음 major.0을 계산한다 — release는
 * 항상 major+1·minor 0이다(서비스 쪽 release()와 동일한 규칙). */
function nextPublishedVersionLabel(a: CalypsoArtifact): string {
  const latest = a.latestVersion;
  const major = latest ? Number(latest.versionLabel.split('.')[0]) || 0 : 0;
  return `${major + 1}.0`;
}

interface Props {
  a: CalypsoArtifact;
  /** 이 데이터로 새 published 버전을 만든다 — 이 버전 자신은 그대로 남는다. */
  version: CalypsoVersionView;
  submitting: boolean;
  onConfirm: (versionNote: string, description: string) => void;
  onClose: () => void;
}

/**
 * Version tree에서 released 아닌 minor 하나를 골라 publish하는 확인창(사용자 요청) —
 * 그 minor 자신은 그대로 남고, 그 데이터로 새 published 버전(major +1)이 하나 더
 * 생긴다. 어느 minor를 고르든 항상 최신 major 다음 번호를 받는다. 이 새 published
 * 버전 자신의 Version Note/Description은 여기서 새로 받는다(Version Note는 source의
 * 값으로 미리 채워 두지만, 그대로 베끼지 않고 고칠 수 있다). AddVersionDialog와 같은
 * 구성(artifact명·버전번호·발행 유저)에 PUBLISH 칩만 더해 구분한다(사용자 요청).
 */
export function PublishVersionDialog({ a, version, submitting, onConfirm, onClose }: Props) {
  const { user } = useAuth();
  const { resolveUser } = useDirectory();
  const me = resolveUser(user?.KnoxID);

  const [versionNote, setVersionNote] = useState(version.versionNote);
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box sx={{ fontSize: 11, color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {a.name}
            </Box>
            <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>PUBLISH</Badge>
          </Box>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>
            Publish v{nextPublishedVersionLabel(a)} — from v{version.versionLabel}
          </Box>
        </>
      }
      footer={
        <SirenButton
          variant="primary"
          disabled={submitting}
          onClick={submit}
        >
          <Icon name="send" /> {submitting ? 'Publishing…' : 'Publish'}
        </SirenButton>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mb: '16px', padding: '9px 11px', background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px' }}>
        <UserAvatar user={me} size={26} />
        <Box>
          <Box sx={{ fontSize: 12, fontWeight: 600 }}>{me.name}</Box>
          <Box sx={{ fontSize: 10.5, color: T.dm2 }}>Publishing this version</Box>
        </Box>
      </Box>

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
