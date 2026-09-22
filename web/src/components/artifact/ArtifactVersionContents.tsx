import { Box } from '@mui/material';
import DOMPurify from 'dompurify';
import { CalypsoArtifact, CalypsoVersionView } from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { isRichTextEmpty } from '@/components/common/RichTextEditor';
import { FileTypeIcon, Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
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
  /**
   * 표지 머리글에 찍히는 부서 이름 — `a.department`는 부서 **id**라 그대로 쓸 수 없다(02장
   * §9.3). 이름 조회는 SIREN project 캐시가 필요한 일이라 이 컴포넌트가 직접 하지 않고
   * 호출부(ArtifactDetailPage)가 풀어서 내려 준다.
   */
  departmentLabel: string;
  onDownload: (v: CalypsoVersionView) => void;
}

/**
 * 왼쪽(A) 영역 — 지금 고른 버전의 표지(문서면)만 그린다. "새 버전 추가"/"publish"는
 * 이제 여기 없다 — Dialog(AddVersionDialog/PublishVersionDialog)로 옮겨서 version
 * history 위쪽 버튼과 트리 각 행에서 각각 띄운다(사용자 요청).
 */
export function ArtifactVersionContents({ a, version: v, departmentLabel, onDownload }: Props) {
  const { resolveUser } = useDirectory();
  const accent = v?.isReleased ? T.pr : T.warn;
  // "WORKING"은 지금 보이는 버전이 실제 latest일 때만 — 사용자가 버전 트리에서 과거의
  // 미발행 버전을 눌러 봐도 그게 "지금 작업 중인 것"처럼 보이면 안 된다(사용자 지적,
  // ArtifactVersionTree/ArtifactSlide의 generic 버전 목록과 같은 규칙).
  const isLatest = !!v && a.latestVersion?.versionRef === v.versionRef;

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
      <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto' }}>
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
                {departmentLabel}
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

              {v.versionNote && (
                <Box
                  sx={{
                    mt: '18px', padding: '13px 15px', borderRadius: '9px', background: T.sf2,
                    border: `1px solid ${T.ln}`, borderLeft: `3px solid ${accent}`,
                    fontSize: 13, lineHeight: 1.6, color: T.tx,
                  }}
                >
                  {v.versionNote}
                </Box>
              )}

              {!isRichTextEmpty(v.description) && (
                <Box
                  // description은 HTML로 저장된다(가벼운 서식 에디터, 사용자 요청) — 그대로
                  // 꽂기 전에 반드시 sanitize한다. 이 화면 밖(예: 과거 API 직접 호출,
                  // 마이그레이션 스크립트)에서 들어온 값일 수도 있어 "우리 에디터가
                  // 만들었으니 안전하다"는 가정을 하지 않는다.
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(v.description) }}
                  sx={{
                    mt: '10px', padding: '13px 15px', borderRadius: '9px', background: T.sf2,
                    border: `1px solid ${T.ln}`,
                    fontSize: 13, lineHeight: 1.75, color: T.tx2,
                    '& p': { margin: '0 0 6px 0' }, '& p:last-child': { mb: 0 },
                    '& ul, & ol': { paddingLeft: '20px', margin: '4px 0' },
                    '& a': { color: T.pr },
                  }}
                />
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
                        <FileTypeIcon fileName={f.fileName} size={14} />
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

                {(v.links ?? []).length > 0 && (
                  <>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                      {v.links.length > 1 ? `Links (${v.links.length})` : 'Link'}
                    </Box>
                    {v.links.map((l, i) => (
                      <Box key={`${l.url}-${i}`} sx={{ mb: '11px' }}>
                        {l.label && (
                          <Box sx={{ fontSize: 11, color: T.dm, mb: '3px' }}>{l.label}</Box>
                        )}
                        {/* link 자신이 이미 hyperlink라 별도 "Open link" 버튼은 두지 않는다(사용자 요청). */}
                        <Box
                          component="a"
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          sx={{
                            display: 'block', fontSize: 12.5, color: T.pr, wordBreak: 'break-all',
                            background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px', padding: '9px 11px',
                          }}
                        >
                          {l.url}
                        </Box>
                      </Box>
                    ))}
                  </>
                )}

                {(v.paths ?? []).length > 0 && (
                  <>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: T.dm2, mb: '9px' }}>
                      {v.paths.length > 1 ? `HPC Paths (${v.paths.length})` : 'HPC Path'}
                    </Box>
                    {v.paths.map((p, i) => (
                      <Box key={`${p.path}-${i}`} sx={{ mb: '11px' }}>
                        {p.label && (
                          <Box sx={{ fontSize: 11, color: T.dm, mb: '3px' }}>{p.label}</Box>
                        )}
                        <Box
                          sx={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontFamily: FONT_MONO, fontSize: 11.5, color: T.tx, wordBreak: 'break-all',
                            background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '7px', padding: '9px 11px',
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>{p.path}</Box>
                          <SirenButton variant="ghost" onClick={() => copyPath(p.path)} sx={{ minWidth: 0, padding: '4px', flex: '0 0 auto' }}>
                            <Icon name="copy" size={13} />
                          </SirenButton>
                        </Box>
                      </Box>
                    ))}
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
      </Box>
    </Box>
  );
}
