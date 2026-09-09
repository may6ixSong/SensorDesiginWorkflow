import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import { CalypsoArtifact, CalypsoVersionView } from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

function fmtAt(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

interface Props {
  a: CalypsoArtifact;
  version: CalypsoVersionView | null;
  canEdit: boolean;
  onDownload: (v: CalypsoVersionView) => void;
  onUpload: (file: File, note: string) => void;
  onRelease: (note: string) => void;
  uploading: boolean;
  releasing: boolean;
}

/**
 * 왼쪽(A) 영역 — 문서면 + 업로드 폼을 한 컬럼에 둔다(사용자 요청: B의 업로드를 A로
 * 옮긴다). Calypso는 실제 파일을 갖고 있으므로(§1.2와 달리 여기가 실물의 주인이다)
 * 링크-아웃이 아니라 진짜 다운로드 버튼을 낸다.
 */
export function ArtifactVersionContents({
  a, version: v, canEdit, onDownload, onUpload, onRelease, uploading, releasing,
}: Props) {
  const { resolveUser } = useDirectory();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const accent = v?.isReleased ? T.tl : T.am;

  return (
    <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto', minHeight: v ? undefined : 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {v ? (
          <Box
            sx={{
              background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '12px',
              boxShadow: T.sl, overflow: 'hidden', display: 'flex', flexDirection: 'column',
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
                <Badge color={accent} bg={v.isReleased ? T.tl2 : T.am2} borderColor={v.isReleased ? T.tl3 : T.am3}>
                  {v.isReleased ? 'RELEASE' : 'WORKING'}
                </Badge>
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
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                  File
                </Box>
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx,
                    background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px',
                    padding: '9px 11px', wordBreak: 'break-all',
                  }}
                >
                  <Icon name="word" size={14} />
                  {v.fileName}
                </Box>
                <Box sx={{ mt: '11px' }}>
                  <SirenButton onClick={() => onDownload(v)}>
                    <Icon name="dn" /> Download
                  </SirenButton>
                </Box>
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
            <Box sx={{ fontSize: 12.5, mt: '9px' }}>Nothing uploaded yet.</Box>
          </Box>
        )}

        {canEdit && (
          <Box sx={{ background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '12px', padding: '18px 20px' }}>
            <Box sx={{ fontSize: 13, fontWeight: 700, mb: '12px' }}>Upload a new version</Box>
            <Field label="File">
              <Box
                component="input"
                type="file"
                ref={fileRef}
                sx={{ fontSize: 12.5, width: '100%' }}
              />
            </Field>
            <Field label="Note">
              <TextInput value={note} onChange={setNote} placeholder="What changed in this version" />
            </Field>
            <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <SirenButton
                variant="primary"
                disabled={uploading}
                onClick={() => {
                  const file = fileRef.current?.files?.[0];
                  if (!file) return;
                  onUpload(file, note);
                  setNote('');
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                <Icon name="up" /> Upload working copy
              </SirenButton>
              <SirenButton
                disabled={!a.latestVersion || a.latestVersion.isReleased || releasing}
                onClick={() => onRelease(note)}
                sx={{ color: T.tl, borderColor: T.tl3 }}
              >
                <Icon name="send" /> Release latest
              </SirenButton>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
