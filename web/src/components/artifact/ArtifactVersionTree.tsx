import { Box } from '@mui/material';
import DOMPurify from 'dompurify';
import { CalypsoVersionView } from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';
import { ReleaseBadge } from '@/lib/releaseBadge';

/** 트리 행은 좁아서 서식까지 그대로 그리면 줄바꿈이 어긋난다 — 태그만 벗겨 한 줄
 * 미리보기로 쓴다(본문 서식은 표지 카드에서 그대로 보여준다). */
function notePreview(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).trim();
}

const RAIL_W = 44;
const TRUNK_X = 11;
const BRANCH_X = 29;
const NODE_Y = 15;

interface Props {
  versions: CalypsoVersionView[];
  selected?: CalypsoVersionView | null;
  onSelect?: (v: CalypsoVersionView) => void;
  /**
   * 이 버전이 어느 workflow release로 처음 나갔는지 — 산출물 상세 슬라이드가 자기가
   * 열려 있는 그 workflow 기준으로 붙여준다(설계서 05장 §7.3와 같은 규칙,
   * lib/releaseBadge 공유). 독립 Artifact 상세 페이지는 특정 workflow에 매인 화면이
   * 아니라 이 값을 안 줄 수 있다 — 그러면 배지를 그리지 않는다.
   */
  releaseBadgeFor?: (v: CalypsoVersionView) => ReleaseBadge | undefined;
  onOpenRelease?: (releaseId: string) => void;
  /** true면 released 아닌 각 행에 Publish 버튼을 낸다(edit 권한자만, 사용자 요청 —
   * "새 버전 추가"뿐 아니라 publish도 최신이 아닌 과거 minor를 골라 할 수 있어야 한다). */
  canPublish?: boolean;
  onPublish?: (v: CalypsoVersionView) => void;
}

function fmtAt(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/**
 * Calypso 산출물 버전 트리 — workflow 쪽 VersionTree(deliverable/VersionTree.tsx)와
 * 같은 줄기/가지 언어를 쓴다(release=줄기, working=가지). 버전 모양이 달라서
 * (major.minor + 실제 파일 vs tier/giver) 컴포넌트 자체는 분리했다.
 */
export function ArtifactVersionTree({
  versions, selected, onSelect, releaseBadgeFor, onOpenRelease, canPublish, onPublish,
}: Props) {
  const { resolveUser } = useDirectory();

  if (!versions.length) {
    return (
      <Box
        sx={{
          border: `1px dashed ${T.ln2}`, borderRadius: '10px', background: T.sf,
          padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: T.dm2,
        }}
      >
        No versions uploaded yet.
      </Box>
    );
  }

  return (
    <Box>
      {versions.map((v, i) => {
        const first = i === 0;
        const last = i === versions.length - 1;
        const isSel = selected?.versionRef === v.versionRef;
        const by = resolveUser(v.createdBy);
        const relBadge = releaseBadgeFor?.(v);

        return (
          <Box key={v.versionRef} sx={{ display: 'flex', gap: '10px' }}>
            <Box sx={{ position: 'relative', flex: `0 0 ${RAIL_W}px`, width: RAIL_W }}>
              <Box
                sx={{
                  position: 'absolute', left: TRUNK_X - 1, width: 2,
                  top: first ? NODE_Y : 0,
                  bottom: last ? `calc(100% - ${NODE_Y}px)` : 0,
                  background: T.ln2,
                }}
              />
              {!v.isReleased && (
                <Box
                  sx={{
                    position: 'absolute', left: TRUNK_X, top: NODE_Y - 1,
                    width: BRANCH_X - TRUNK_X, height: 2, background: T.warnLine,
                  }}
                />
              )}
              <Box
                onClick={() => onSelect?.(v)}
                sx={{
                  position: 'absolute',
                  left: (v.isReleased ? TRUNK_X : BRANCH_X) - (v.isReleased ? 7 : 5),
                  top: NODE_Y - (v.isReleased ? 7 : 5),
                  width: v.isReleased ? 14 : 10,
                  height: v.isReleased ? 14 : 10,
                  borderRadius: '50%',
                  background: v.isReleased ? T.pr : T.sf,
                  border: `2px solid ${v.isReleased ? T.pr : T.warnLine}`,
                  boxShadow: isSel ? `0 0 0 4px ${v.isReleased ? T.prSoft : T.warnSoft}` : 'none',
                  cursor: onSelect ? CURSOR_POINTER : 'default',
                  transition: 'box-shadow .15s',
                }}
              />
            </Box>

            <Box
              onClick={() => onSelect?.(v)}
              sx={{
                flex: 1, minWidth: 0, mb: '8px',
                background: isSel ? (v.isReleased ? T.prSoft : T.warnSoft) : T.sf,
                border: `1px solid ${isSel ? (v.isReleased ? T.prLine : T.warnLine) : T.ln}`,
                borderRadius: '9px', padding: '8px 11px 9px',
                cursor: onSelect ? CURSOR_POINTER : 'default',
                transition: 'background .15s, border-color .15s',
                '&:hover': onSelect ? { borderColor: v.isReleased ? T.prLine : T.warnLine } : {},
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: v.isReleased ? T.pr : T.warn }}>
                  v{v.versionLabel}
                </Box>
                {/* "WORKING"은 가장 최신 버전(first)이 미발행일 때만 — 과거의 미발행
                    버전까지 전부 WORKING으로 보이면 "지금 작업 중인 게 여러 개"처럼
                    잘못 읽힌다(사용자 지적, ArtifactSlide의 generic 버전 목록과 같은 규칙). */}
                {v.isReleased ? (
                  <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>PUBLISHED</Badge>
                ) : first ? (
                  <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>WORKING</Badge>
                ) : null}
                {first && <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>LATEST</Badge>}
                {relBadge && (
                  <Box
                    component={onOpenRelease ? 'button' : 'span'}
                    onClick={onOpenRelease ? () => onOpenRelease(relBadge.id) : undefined}
                    title="First went out in this workflow's release"
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
                      padding: '2px 6px', borderRadius: `${R.xs}px`,
                      background: T.prSoft, color: T.pr, border: `1px solid ${T.prLine}`,
                      ...(onOpenRelease && { cursor: CURSOR_POINTER, '&:hover': { background: T.prLine } }),
                    }}
                  >
                    {relBadge.label}
                  </Box>
                )}
              </Box>
              {notePreview(v.note) && (
                <Box
                  sx={{
                    fontSize: 12, color: T.tx, mt: '5px', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}
                >
                  {notePreview(v.note)}
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '5px' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, flex: 1, minWidth: 0 }}>
                  {by.name} · {fmtAt(v.createdAt)}
                </Box>
                {canPublish && !v.isReleased && onPublish && (
                  <Box onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ flex: '0 0 auto' }}>
                    <SirenButton
                      variant="ghost"
                      onClick={() => onPublish(v)}
                      sx={{ fontSize: 10.5, padding: '3px 8px', color: T.pr }}
                    >
                      <Icon name="send" size={11} /> Publish
                    </SirenButton>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
