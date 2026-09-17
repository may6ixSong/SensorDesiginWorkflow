import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CalypsoArtifact, CalypsoLink, CalypsoPathEntry } from '@/api/calypsoClient';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { ModalShell } from '@/components/common/ModalShell';
import { Field, TextInput } from '@/components/common/Panel';
import { RichTextEditor } from '@/components/common/RichTextEditor';
import { SirenButton } from '@/components/common/SirenButton';
import { FileTypeIcon, Icon } from '@/components/common/Icon';
import { FONT_MONO, T } from '@/theme/tokens';

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
  onSubmit: (
    input: { files?: File[]; links?: CalypsoLink[]; paths?: CalypsoPathEntry[] },
    versionNote: string,
    description: string,
  ) => void;
  submitting: boolean;
  onClose: () => void;
}

/**
 * "Add a new version" — 표지 옆에 늘 펼쳐진 폼이 아니라 버튼을 눌러야 뜨는 Dialog다
 * (사용자 요청: version history 위쪽 버튼으로 옮기고, 폼 자체는 여기로). 어떤
 * artifact에 어느 버전 번호로, 누가 올리는지를 폼 위에서 바로 보여준다(사용자 요청).
 *
 * ★ 파일/링크/경로는 서로 배타적이지 않다(사용자 요청) — 파일은 network와 무관하게
 *   항상 올릴 수 있고, 그 위에 network에 맞는 위치 정보(OA면 링크, HPC면 경로)도 몇
 *   개든 같이 붙일 수 있다. 파일 선택 자체는 브라우저 기본 `<input type=file>`을 쓰지
 *   않는다 — 그 버튼/안내 문구는 브라우저 자체 언어를 따라가서 앱의 언어 설정과
 *   어긋날 수 있었다(사용자 지적). 대신 숨긴 input + 우리가 직접 그린 버튼/목록을 쓴다.
 */
export function AddVersionDialog({ a, onSubmit, submitting, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { resolveUser } = useDirectory();
  const me = resolveUser(user?.KnoxID);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<CalypsoLink[]>([]);
  const [paths, setPaths] = useState<CalypsoPathEntry[]>([]);
  const [versionNote, setVersionNote] = useState('');
  const [description, setDescription] = useState('');
  const [noteErr, setNoteErr] = useState(false);

  const network = a.network;
  const hasContent = files.length > 0
    || (network === 'OA' && links.some((l) => l.url.trim()))
    || (network === 'HPC' && paths.some((p) => p.path.trim()));

  const addFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    setFiles((prev) => [...prev, ...Array.from(picked)]);
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));

  const addLink = () => setLinks((prev) => [...prev, { url: '', label: '' }]);
  const updateLink = (i: number, next: CalypsoLink) => setLinks((prev) => prev.map((l, j) => (j === i ? next : l)));
  const removeLink = (i: number) => setLinks((prev) => prev.filter((_, j) => j !== i));

  const addPath = () => setPaths((prev) => [...prev, { path: '', label: '' }]);
  const updatePath = (i: number, next: CalypsoPathEntry) => setPaths((prev) => prev.map((p, j) => (j === i ? next : p)));
  const removePath = (i: number) => setPaths((prev) => prev.filter((_, j) => j !== i));

  const submit = () => {
    if (!network) return;
    if (!versionNote.trim()) { setNoteErr(true); return; }
    if (!hasContent) return;
    onSubmit(
      {
        files,
        links: network === 'OA' ? links.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), label: l.label.trim() })) : undefined,
        paths: network === 'HPC' ? paths.filter((p) => p.path.trim()).map((p) => ({ path: p.path.trim(), label: p.label.trim() })) : undefined,
      },
      versionNote.trim(),
      description,
    );
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
        <SirenButton variant="primary" disabled={submitting || !network || !hasContent} onClick={submit}>
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

      {!network ? (
        <Box sx={{ fontSize: 12, color: T.warn, lineHeight: 1.6 }}>{t('artifact.setNetworkFirst')}</Box>
      ) : (
        <>
          <Field label="Files">
            <Box
              component="input"
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { addFiles(e.target.files); e.target.value = ''; }}
              sx={{ display: 'none' }}
            />
            <SirenButton onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={12} /> {t('artifact.addFiles')}
            </SirenButton>
            <Box sx={{ mt: '9px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {files.length === 0 ? (
                <Box sx={{ fontSize: 11.5, color: T.dm2 }}>{t('artifact.noFilesYet')}</Box>
              ) : files.map((f, i) => (
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
                  <Box sx={{ flex: 1, minWidth: 0 }}>{f.name}</Box>
                  <SirenButton variant="ghost" onClick={() => removeFile(i)} sx={{ minWidth: 0, padding: '3px' }} title={t('artifact.removeFile')}>
                    <Icon name="x" size={12} />
                  </SirenButton>
                </Box>
              ))}
            </Box>
          </Field>

          {network === 'OA' && (
            <Field label="Links">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', mb: '8px' }}>
                {links.map((l, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                      <TextInput
                        value={l.url}
                        onChange={(v) => updateLink(i, { ...l, url: v })}
                        placeholder={t('artifact.linkUrlPlaceholder')}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                      <TextInput
                        value={l.label}
                        onChange={(v) => updateLink(i, { ...l, label: v })}
                        placeholder={t('artifact.linkLabelPlaceholder')}
                      />
                    </Box>
                    <SirenButton variant="ghost" onClick={() => removeLink(i)} sx={{ minWidth: 0, padding: '7px' }} title={t('artifact.removeEntry')}>
                      <Icon name="x" size={13} />
                    </SirenButton>
                  </Box>
                ))}
              </Box>
              <SirenButton onClick={addLink}>
                <Icon name="plus" size={12} /> {t('artifact.addLink')}
              </SirenButton>
            </Field>
          )}

          {network === 'HPC' && (
            <Field label="Paths">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', mb: '8px' }}>
                {paths.map((p, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                      <TextInput
                        value={p.path}
                        onChange={(v) => updatePath(i, { ...p, path: v })}
                        placeholder={t('artifact.pathValuePlaceholder')}
                      />
                    </Box>
                    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
                      <TextInput
                        value={p.label}
                        onChange={(v) => updatePath(i, { ...p, label: v })}
                        placeholder={t('artifact.pathLabelPlaceholder')}
                      />
                    </Box>
                    <SirenButton variant="ghost" onClick={() => removePath(i)} sx={{ minWidth: 0, padding: '7px' }} title={t('artifact.removeEntry')}>
                      <Icon name="x" size={13} />
                    </SirenButton>
                  </Box>
                ))}
              </Box>
              <SirenButton onClick={addPath}>
                <Icon name="plus" size={12} /> {t('artifact.addPath')}
              </SirenButton>
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
        </>
      )}
    </ModalShell>
  );
}
