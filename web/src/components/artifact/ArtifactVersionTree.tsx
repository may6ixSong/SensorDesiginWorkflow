import { Box } from '@mui/material';
import { CalypsoVersionView } from '@/api/calypsoClient';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

const RAIL_W = 44;
const TRUNK_X = 11;
const BRANCH_X = 29;
const NODE_Y = 15;

interface Props {
  versions: CalypsoVersionView[];
  selected?: CalypsoVersionView | null;
  onSelect?: (v: CalypsoVersionView) => void;
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
export function ArtifactVersionTree({ versions, selected, onSelect }: Props) {
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
                    width: BRANCH_X - TRUNK_X, height: 2, background: T.am3,
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
                  background: v.isReleased ? T.tl : T.sf,
                  border: `2px solid ${v.isReleased ? T.tl : T.am3}`,
                  boxShadow: isSel ? `0 0 0 4px ${v.isReleased ? T.tl2 : T.am2}` : 'none',
                  cursor: onSelect ? CURSOR_POINTER : 'default',
                  transition: 'box-shadow .15s',
                }}
              />
            </Box>

            <Box
              onClick={() => onSelect?.(v)}
              sx={{
                flex: 1, minWidth: 0, mb: '8px',
                background: isSel ? (v.isReleased ? T.tl2 : T.am2) : T.sf,
                border: `1px solid ${isSel ? (v.isReleased ? T.tl3 : T.am3) : T.ln}`,
                borderRadius: '9px', padding: '8px 11px 9px',
                cursor: onSelect ? CURSOR_POINTER : 'default',
                transition: 'background .15s, border-color .15s',
                '&:hover': onSelect ? { borderColor: v.isReleased ? T.tl3 : T.am3 } : {},
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: v.isReleased ? T.tl : T.am }}>
                  v{v.versionLabel}
                </Box>
                <Badge
                  color={v.isReleased ? T.tl : T.am}
                  bg={v.isReleased ? T.tl2 : T.am2}
                  borderColor={v.isReleased ? T.tl3 : T.am3}
                >
                  {v.isReleased ? 'RELEASE' : 'WORKING'}
                </Badge>
                {first && <Badge color={T.vi} bg={T.vi2} borderColor={T.vi3}>LATEST</Badge>}
              </Box>
              {v.note && <Box sx={{ fontSize: 12, color: T.tx, mt: '5px', lineHeight: 1.5 }}>{v.note}</Box>}
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '5px' }}>
                {by.name} · {fmtAt(v.createdAt)}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
