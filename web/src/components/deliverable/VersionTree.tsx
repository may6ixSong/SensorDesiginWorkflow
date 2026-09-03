import { Box } from '@mui/material';
import { VersionView, fmtAt, versionBy } from '@/lib/canvasModel';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { Badge } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/** 노드가 그려지는 레인 폭 — 릴리스는 줄기(x=11), 작업본은 가지(x=29)에 앉는다. */
const RAIL_W = 44;
const TRUNK_X = 11;
const BRANCH_X = 29;
/** 카드 첫 줄(버전 라벨)의 세로 중심 — 노드를 그 높이에 맞춘다. */
const NODE_Y = 15;

interface Props {
  versions: VersionView[];
  /** 지금 내용 창에 띄워 둔 버전 — 트리에서 강조된다. */
  selected?: VersionView | null;
  onSelect?: (v: VersionView) => void;
}

/**
 * 버전 이력을 나무 모양으로 — release는 줄기에 굵은 노드로, 작업본(working)은
 * 그 사이에서 오른쪽으로 뻗은 가지로 그린다. 목록을 세로로 늘어놓기만 하면 "무엇이
 * 정식 버전이고 무엇이 그 사이 작업이었는지"가 라벨을 읽어야만 보이는데, 줄기/가지로
 * 갈라 두면 그게 한눈에 들어온다.
 *
 * 최신이 위다(BE가 unshift로 쌓아 내려주는 순서 그대로).
 */
export function VersionTree({ versions, selected, onSelect }: Props) {
  const { resolveUser } = useDirectory();

  if (!versions.length) {
    return (
      <Box
        sx={{
          border: `1px dashed ${T.ln2}`, borderRadius: '10px', background: T.sf,
          padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: T.dm2,
        }}
      >
        No versions recorded yet.
      </Box>
    );
  }

  return (
    <Box>
      {versions.map((v, i) => {
        const first = i === 0;
        const last = i === versions.length - 1;
        const isSel = selected
          ? (selected.versionRef ?? selected.versionLabel) === (v.versionRef ?? v.versionLabel)
            && selected.at === v.at
          : false;
        const by = resolveUser(versionBy(v));

        return (
          <Box key={`${v.versionRef ?? v.versionLabel}-${v.at}-${i}`} sx={{ display: 'flex', gap: '10px' }}>
            {/* ── 레인: 줄기 + 가지 + 노드 ── */}
            <Box sx={{ position: 'relative', flex: `0 0 ${RAIL_W}px`, width: RAIL_W }}>
              {/* 줄기 — 첫 행은 노드부터 아래로, 마지막 행은 노드까지만 */}
              <Box
                sx={{
                  position: 'absolute', left: TRUNK_X - 1, width: 2,
                  top: first ? NODE_Y : 0,
                  bottom: last ? `calc(100% - ${NODE_Y}px)` : 0,
                  background: T.ln2,
                }}
              />
              {/* 가지 — 작업본만 줄기에서 오른쪽으로 뻗는다 */}
              {!v.isReleased && (
                <Box
                  sx={{
                    position: 'absolute', left: TRUNK_X, top: NODE_Y - 1,
                    width: BRANCH_X - TRUNK_X, height: 2, background: T.am3,
                  }}
                />
              )}
              {/* 노드 */}
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

            {/* ── 카드 ── */}
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
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600,
                    color: v.isReleased ? T.tl : T.am,
                  }}
                >
                  {v.versionLabel}
                </Box>
                <Badge
                  color={v.isReleased ? T.tl : T.am}
                  bg={v.isReleased ? T.tl2 : T.am2}
                  borderColor={v.isReleased ? T.tl3 : T.am3}
                >
                  {v.isReleased ? 'RELEASE' : 'WORKING'}
                </Badge>
                <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>
                  {v.tier}·{v.confidence}
                </Badge>
                {first && <Badge color={T.vi} bg={T.vi2} borderColor={T.vi3}>LATEST</Badge>}
              </Box>

              {v.note && (
                <Box sx={{ fontSize: 12, color: T.tx, mt: '5px', lineHeight: 1.5 }}>{v.note}</Box>
              )}

              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: '6px', mt: '5px',
                  fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, flexWrap: 'wrap',
                }}
              >
                <Box component="span">{by.name}</Box>
                <Box component="span">·</Box>
                <Box component="span">{fmtAt(v.at)}</Box>
                {(v.hpcPath || v.viewUrl) && (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: T.dm }}>
                    <Icon name="link" size={10} />
                    {v.hpcPath ? 'path' : 'link'}
                  </Box>
                )}
                {(v.sourceRefs?.length ?? 0) > 0 && (
                  <Box component="span" sx={{ color: T.dm }}>
                    from {v.sourceRefs.length} source{v.sourceRefs.length > 1 ? 's' : ''}
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
