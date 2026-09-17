import { useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoArtifact, CalypsoVersionView } from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_DISPLAY, FONT_MONO, R, T } from '@/theme/tokens';

function fmtAt(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** 새 버전에 넣을 콘텐츠 종류. artifact에 버전이 하나도 없으면 여기서 처음 정해진다
 * (설계서 04장 §2.2, §6.4) — 그 뒤로는 `a.network`에 따라 고정된다. */
type ContentKind = 'file' | 'oa' | 'hpc';

const KIND_LABEL: Record<ContentKind, string> = { file: 'File', oa: 'Link (OA)', hpc: 'Path (HPC)' };

interface Props {
  a: CalypsoArtifact;
  version: CalypsoVersionView | null;
  canEdit: boolean;
  onDownload: (v: CalypsoVersionView) => void;
  onAddVersion: (input: { files?: File[]; viewUrl?: string; hpcPath?: string }, note: string) => void;
  onRelease: (note: string) => void;
  uploading: boolean;
  releasing: boolean;
}

/**
 * 왼쪽(A) 영역 — 문서면 + 새 버전 추가 폼을 한 컬럼에 둔다(사용자 요청: B의 업로드를 A로
 * 옮긴다). Calypso는 실제 파일을 갖고 있으므로(§1.2와 달리 여기가 실물의 주인이다)
 * 링크-아웃이 아니라 진짜 다운로드 버튼을 낸다 — File 콘텐츠에 한해서다.
 */
export function ArtifactVersionContents({
  a, version: v, canEdit, onDownload, onAddVersion, onRelease, uploading, releasing,
}: Props) {
  const { resolveUser } = useDirectory();
  const [note, setNote] = useState('');
  const [pickedKind, setPickedKind] = useState<ContentKind | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState('');
  const [path, setPath] = useState('');
  const accent = v?.isReleased ? T.pr : T.warn;
  // "WORKING"은 지금 보이는 버전이 실제 latest일 때만 — 사용자가 버전 트리에서 과거의
  // 미발행 버전을 눌러 봐도 그게 "지금 작업 중인 것"처럼 보이면 안 된다(사용자 지적,
  // ArtifactVersionTree/ArtifactSlide의 generic 버전 목록과 같은 규칙).
  const isLatest = !!v && a.latestVersion?.versionRef === v.versionRef;

  // 이미 버전이 하나라도 있으면 network가 고정돼 있다 — 그 콘텐츠 종류만 보여준다.
  // 아직 하나도 없으면(=콘텐츠 종류를 이번에 처음 정한다) 사용자가 고른 것을 쓴다.
  const fixedKind: ContentKind | null = a.versionCount > 0
    ? (a.network === 'OA' ? 'oa' : a.network === 'HPC' ? 'hpc' : 'file')
    : null;
  const kind = fixedKind ?? pickedKind;

  const resetForm = () => { setNote(''); setFiles([]); setLink(''); setPath(''); setPickedKind(null); };

  const submit = () => {
    if (kind === 'file') {
      if (!files.length) return;
      onAddVersion({ files }, note);
    } else if (kind === 'oa') {
      if (!link.trim()) return;
      onAddVersion({ viewUrl: link.trim() }, note);
    } else if (kind === 'hpc') {
      if (!path.trim()) return;
      onAddVersion({ hpcPath: path.trim() }, note);
    } else {
      return;
    }
    resetForm();
  };

  const copyPath = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Path copied');
    } catch {
      toast('Could not copy — select and copy manually');
    }
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto', minHeight: v ? undefined : 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {v ? (
          <Box
            sx={{
              background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '12px',
              boxShadow: T.shLg, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}
          >
            <Box sx={{ height: 4, background: accent, flex: '0 0 auto' }} />
            <Box sx={{ padding: '24px 28px 26px' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: T.dm2 }}>
                {a.department}
              </Box>
              <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25, mt: '8px' }}>
                {a.name}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mt: '14px', flexWrap: 'wrap' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1 }}>
                  v{v.versionLabel}
                </Box>
                {(v.isReleased || isLatest) && (
                  <Badge color={accent} bg={v.isReleased ? T.prSoft : T.warnSoft} borderColor={v.isReleased ? T.prLine : T.warnLine}>
                    {v.isReleased ? 'PUBLISHED' : 'WORKING'}
                  </Badge>
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mt: '16px', paddingTop: '15px', borderTop: `1px solid ${T.ln}` }}>
                <UserAvatar user={resolveUser(v.createdBy)} size={30} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 600 }}>{resolveUser(v.createdBy).name}</Box>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>{fmtAt(v.createdAt)}</Box>
                </Box>
              </Box>

              {v.note && (
                <Box
                  sx={{
                    mt: '18px', padding: '13px 15px', borderRadius: '9px', background: T.sf2,
                    border: `1px solid ${T.ln}`, borderLeft: `3px solid ${accent}`,
                    fontSize: 13, lineHeight: 1.75, color: T.tx, whiteSpace: 'pre-wrap',
                  }}
                >
                  {v.note}
                </Box>
              )}

              <Box sx={{ mt: '20px', paddingTop: '16px', borderTop: `1px solid ${T.ln}` }}>
                {/* v.files는 서버 DTO(toVersionView)가 항상 배열을 보장하지만, 스키마 확장
                    이전(fileName/storageKey 단수 필드) 시절 문서나 raw driver로 직접 넣은
                    문서처럼 그 보장을 안 거친 데이터가 섞이면 undefined로 올 수 있다 —
                    화면이 통째로 죽지 않게 방어한다. */}
                {(v.files ?? []).length > 0 && (
                  <>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                      {v.files.length > 1 ? `Files (${v.files.length})` : 'File'}
                    </Box>
                    {v.files.map((f) => (
                      <Box
                        key={f.storageKey}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx,
                          background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px',
                          padding: '9px 11px', wordBreak: 'break-all', mb: '6px',
                        }}
                      >
                        <Icon name="word" size={14} />
                        {f.fileName}
                      </Box>
                    ))}
                    <Box sx={{ mt: '11px' }}>
                      <SirenButton onClick={() => onDownload(v)}>
                        <Icon name="dn" /> {v.files.length > 1 ? 'Download all (.zip)' : 'Download'}
                      </SirenButton>
                    </Box>
                  </>
                )}

                {v.viewUrl && (
                  <>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                      Link
                    </Box>
                    <Box
                      component="a"
                      href={v.viewUrl}
                      target="_blank"
                      rel="noreferrer"
                      sx={{
                        display: 'block', fontSize: 12.5, color: T.pr, wordBreak: 'break-all',
                        background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px', padding: '9px 11px',
                        mb: '11px', cursor: CURSOR_POINTER,
                      }}
                    >
                      {v.viewUrl}
                    </Box>
                    <SirenButton onClick={() => window.open(v.viewUrl as string, '_blank', 'noopener')}>
                      <Icon name="link" /> Open link
                    </SirenButton>
                  </>
                )}

                {v.hpcPath && (
                  <>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                      HPC Path
                    </Box>
                    <Box
                      sx={{
                        fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx, wordBreak: 'break-all',
                        background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px', padding: '9px 11px',
                        mb: '11px',
                      }}
                    >
                      {v.hpcPath}
                    </Box>
                    <SirenButton onClick={() => copyPath(v.hpcPath as string)}>
                      <Icon name="copy" /> Copy path
                    </SirenButton>
                  </>
                )}
              </Box>
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
              padding: '40px 20px', textAlign: 'center', color: T.dm2,
            }}
          >
            <Icon name="word" size={24} />
            <Box sx={{ fontSize: 12.5, mt: '9px' }}>Nothing added yet.</Box>
          </Box>
        )}

        {canEdit && (
          <Box sx={{ background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '12px', padding: '18px 20px' }}>
            <Box sx={{ fontSize: 13, fontWeight: 700, mb: '12px' }}>Add a new version</Box>

            {!kind ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', mb: '12px' }}>
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
                  <Field label={files.length > 1 ? `Files (${files.length} selected)` : 'File'}>
                    <Box
                      component="input"
                      type="file"
                      multiple
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiles(Array.from(e.target.files ?? []))}
                      sx={{ fontSize: 12.5, width: '100%' }}
                    />
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
                <Field label="Note">
                  <TextInput value={note} onChange={setNote} placeholder="What changed in this version" />
                </Field>
                <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <SirenButton variant="primary" disabled={uploading} onClick={submit}>
                    <Icon name="up" /> {uploading ? 'Adding…' : 'Add version'}
                  </SirenButton>
                  {!fixedKind && (
                    <SirenButton onClick={() => setPickedKind(null)}>Back</SirenButton>
                  )}
                  <SirenButton
                    disabled={!a.latestVersion || a.latestVersion.isReleased || releasing}
                    onClick={() => onRelease(note)}
                    sx={{ color: T.pr, borderColor: T.prLine }}
                  >
                    <Icon name="send" /> Publish latest
                  </SirenButton>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
