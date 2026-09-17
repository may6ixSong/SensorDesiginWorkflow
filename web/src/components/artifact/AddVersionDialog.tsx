import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoArtifact } from '@/api/calypsoClient';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, TextInput } from '@/components/common/Panel';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { SirenButton } from '@/components/common/SirenButton';
import { FileTypeIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

/** 새 버전에 넣을 콘텐츠 종류. artifact에 버전이 하나도 없으면 여기서 처음 정해진다
 * (설계서 04장 §2.2, §6.4) — 그 뒤로는 `a.network`에 따라 고정된다. */
type ContentKind = 'file' | 'oa' | 'hpc';

const KIND_LABEL: Record<ContentKind, string> = { file: 'File', oa: 'Link (OA)', hpc: 'Path (HPC)' };

/** latestVersion.versionLabel("major.minor")에서 다음 minor를 계산한다 — 아직 버전이
 * 하나도 없으면 첫 버전은 항상 0.1이다(서비스 쪽 nextVersionLabel()과 동일한 규칙). */
function nextVersionLabel(a: CalypsoArtifact): string {
  if (!a.latestVersion) return '0.1';
  const [majorStr, minorStr] = a.latestVersion.versionLabel.split('.');
  const major = Number(majorStr) || 0;
  const minor = Number(minorStr) || 0;
  return `${major}.${minor + 1}`;
}

interface Props {
  a: CalypsoArtifact;
  onSubmit: (input: { files?: File[]; viewUrl?: string; hpcPath?: string }, versionNote: string, description: string) => void;
  submitting: boolean;
  onClose: () => void;
}

/**
 * "Add a new version" — 이제 표지 옆에 늘 펼쳐진 폼이 아니라 버튼을 눌러야 뜨는
 * Dialog다(사용자 요청: version history 위쪽 버튼으로 옮기고, 폼 자체는 여기로). 어떤
 * artifact에 어느 버전 번호로, 누가 올리는지를 폼 위에서 바로 보여준다(사용자 요청).
 */
export function AddVersionDialog({ a, onSubmit, submitting, onClose }: Props) {
  const { user } = useAuth();
  const { resolveUser } = useDirectory();
  const me = resolveUser(user?.KnoxID);

  const [pickedKind, setPickedKind] = useState<ContentKind | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState('');
  const [path, setPath] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [description, setDescription] = useState('');
  const [noteErr, setNoteErr] = useState(false);

  // 이미 버전이 하나라도 있으면 network가 고정돼 있다 — 그 콘텐츠 종류만 보여준다.
  // 아직 하나도 없으면(=콘텐츠 종류를 이번에 처음 정한다) 사용자가 고른 것을 쓴다.
  const fixedKind: ContentKind | null = a.versionCount > 0
    ? (a.network === 'OA' ? 'oa' : a.network === 'HPC' ? 'hpc' : 'file')
    : null;
  const kind = fixedKind ?? pickedKind;

  const submit = () => {
    if (!versionNote.trim()) { setNoteErr(true); return; }
    if (kind === 'file') {
      if (!files.length) return;
      onSubmit({ files }, versionNote.trim(), description);
    } else if (kind === 'oa') {
      if (!link.trim()) return;
      onSubmit({ viewUrl: link.trim() }, versionNote.trim(), description);
    } else if (kind === 'hpc') {
      if (!path.trim()) return;
      onSubmit({ hpcPath: path.trim() }, versionNote.trim(), description);
    } else {
      return;
    }
    onClose();
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={1150}
      header={
        <>
          <Box sx={{ fontSize: 11, color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {a.name}
          </Box>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Add version v{nextVersionLabel(a)}</Box>
        </>
      }
      footer={
        <SirenButton variant="primary" disabled={submitting || !kind} onClick={submit}>
          <Icon name="up" /> {submitting ? 'Adding…' : 'Add version'}
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

      {!kind ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>
            This artifact has no version yet — pick what it will hold. This can&apos;t be changed afterwards.
          </Box>
          <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(Object.keys(KIND_LABEL) as ContentKind[]).map((k) => (
              <Box
                key={k}
                component="button"
                type="button"
                onClick={() => setPickedKind(k)}
                sx={{
                  fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: `${R.sm}px`,
                  cursor: CURSOR_POINTER, background: T.sf, border: `1px solid ${T.ln2}`, color: T.dm,
                  '&:hover': { borderColor: T.pr, color: T.pr },
                }}
              >
                {KIND_LABEL[k]}
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <>
          {kind === 'file' && (
            <Field label="Files">
              <Box
                component="input"
                type="file"
                multiple
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiles(Array.from(e.target.files ?? []))}
                sx={{ fontSize: 12.5, width: '100%' }}
              />
              {files.length > 0 && (
                <Box sx={{ mt: '9px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {files.map((f, i) => (
                    <Box
                      key={`${f.name}-${i}`}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx,
                        background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px',
                        padding: '8px 10px', wordBreak: 'break-all',
                      }}
                    >
                      <FileTypeIcon fileName={f.name} size={14} />
                      {f.name}
                    </Box>
                  ))}
                </Box>
              )}
            </Field>
          )}
          {kind === 'oa' && (
            <Field label="Link">
              <TextInput value={link} onChange={setLink} placeholder="https://…" />
            </Field>
          )}
          {kind === 'hpc' && (
            <Field label="HPC path">
              <TextInput value={path} onChange={setPath} placeholder="/vwp/…" />
            </Field>
          )}
          <Field label="Version Note — required, a short one-line summary">
            <TextInput
              value={versionNote}
              onChange={(v) => { setVersionNote(v); setNoteErr(false); }}
              error={noteErr}
              placeholder="What changed in this version"
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
          {!fixedKind && (
            <Box sx={{ mt: '-6px', mb: '6px' }}>
              <SirenButton onClick={() => setPickedKind(null)}>Back</SirenButton>
            </Box>
          )}
        </>
      )}
    </ModalShell>
  );
}
