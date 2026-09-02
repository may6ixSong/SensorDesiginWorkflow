import { Box } from '@mui/material';
import { CanvasEdge, CanvasNode, biIconPos, latR, orth, stOf } from '@/lib/canvasModel';
import { CURSOR_POINTER } from '@/theme/tokens';

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  width: number;
  height: number;
  edit: boolean;
  canEdit: boolean;
  hlSet: Set<string> | null;
  link: string | null;
  linkPos: { x: number; y: number } | null;
  onDeleteEdge: (id: string) => void;
}

/**
 * 목업 drawEdges() — 직교 라우팅 SVG 레이어 (설계서 3.9).
 * - 양방향: 역방향 쌍(또는 bidirectional 플래그) → 양쪽 화살촉 + 순환 아이콘(편집모드 숨김)
 * - blocked: 선행 산출물이 미릴리스인데 후행이 진행됨 → 주황 점선
 * - 하이라이트: 실선을 옅게 깔고 그 위에 흐르는 점선 애니메이션
 */
export function EdgeLayer({
  nodes, edges, width, height, edit, canEdit, hlSet, link, linkPos, onDeleteEdge,
}: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const parts: JSX.Element[] = [];

  edges.forEach((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return;

    const bi = e.bidirectional || edges.some((x) => x.from === e.to && x.to === e.from);
    const key = bi ? [e.from, e.to].sort().join('|') : e.id;
    if (bi) {
      if (seen.has(key)) return;
      seen.add(key);
    }

    const blocked = !bi && !latR(a) && stOf(b).lb !== 'Not submitted';
    const on = !!hlSet && hlSet.has(e.from) && hlSet.has(e.to);
    // 선택된 산출물과 무관한 flow — 관련 없는 블록을 흐리게 하는 것과 같은 기준(0.6)으로
    // 같이 낮춘다. <g>로 묶어야 marker(화살촉)까지 함께 흐려진다.
    const unrelated = !!hlSet && !on;
    const col = on ? '#2f6b4a' : blocked ? '#ac6f08' : '#5c6b7d';
    const mk = on ? 'ahl' : blocked ? 'ahb' : 'ah';
    const dpath = orth(a, b);
    const segs: JSX.Element[] = [];

    segs.push(
      <path
        key={`${e.id}-main`}
        d={dpath}
        stroke={col}
        strokeWidth={on ? 3.6 : 3}
        fill="none"
        markerEnd={`url(#${mk})`}
        markerStart={bi ? `url(#${on ? 'ahl-s' : 'ah-s'})` : undefined}
        strokeDasharray={blocked ? '7 6' : undefined}
        // crispEdges를 유지한다 — 픽셀 단위로 스냅해 안티에일리어싱 흐림 없이 그려서,
        // 캔버스가 CSS scale()로 축소되는 최대 줌아웃(z=0.3)에서도 anti-aliased(흐린)
        // 렌더링보다 오히려 더 진하고 또렷하게 남는다(실측 비교 확인). 예전에 안 보이던
        // 것은 crispEdges 때문이 아니라 선 자체가 얇았던 탓 — 아래 폭을 굵혔다.
        shapeRendering="crispEdges"
      />,
    );

    if (on) {
      segs.push(
        <path key={`${e.id}-bg`} d={dpath} stroke={col} strokeWidth={3.6} fill="none" opacity={0.18} shapeRendering="crispEdges" />,
        <path
          key={`${e.id}-dash`}
          d={dpath}
          stroke="#2f6b4a"
          strokeWidth={3.8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="12 15"
          style={{ animation: 'flowdash .65s linear infinite' }}
          markerEnd="url(#ahl)"
        />,
      );
    }

    if (bi && !edit) {
      const c = biIconPos(a, b);
      segs.push(
        <g key={`${e.id}-cyc`} transform={`translate(${c.x - 16},${c.y - 16}) scale(1.47)`} pointerEvents="none">
          <path d="M16.8 9.8A5.4 5.4 0 0 0 6.8 8.9" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" />
          <path d="M5.2 13.2a5.4 5.4 0 0 0 9.8 1.1" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" />
          <path d="M17 6v3.8h-3.8" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 16v-3.8h3.8" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>,
      );
    }

    if (edit && canEdit) {
      segs.push(
        <path
          key={`${e.id}-hit`}
          d={dpath}
          stroke="transparent"
          strokeWidth={18}
          fill="none"
          style={{ pointerEvents: 'stroke', cursor: CURSOR_POINTER }}
          onClick={(ev) => {
            ev.stopPropagation();
            onDeleteEdge(e.id);
          }}
        >
          <title>Click to remove this link</title>
        </path>,
      );
    }

    parts.push(
      <g key={e.id} opacity={unrelated ? 0.6 : 1}>
        {segs}
      </g>,
    );
  });

  // 연결 중 커서를 따라가는 안내선
  if (link && byId.get(link) && linkPos) {
    const a = byId.get(link)!;
    parts.push(
      <path
        key="linkline"
        d={`M${a.x + a.w},${Math.round(a.y + a.h / 2)}H${linkPos.x}V${linkPos.y}`}
        stroke="#2f6b4a"
        strokeWidth={3}
        strokeDasharray="7 6"
        fill="none"
        markerEnd="url(#ahl)"
      />,
    );
  }

  return (
    <Box
      component="svg"
      width={width}
      height={height}
      sx={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <defs>
        <marker id="ah" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
          <path d="M0,0L12,6L0,12Z" fill="#5c6b7d" />
        </marker>
        <marker id="ahb" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
          <path d="M0,0L12,6L0,12Z" fill="#ac6f08" />
        </marker>
        <marker id="ahl" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
          <path d="M0,0L12,6L0,12Z" fill="#2f6b4a" />
        </marker>
        <marker id="ah-s" markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto">
          <path d="M12,0L0,6L12,12Z" fill="#5c6b7d" />
        </marker>
        <marker id="ahl-s" markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto">
          <path d="M12,0L0,6L12,12Z" fill="#2f6b4a" />
        </marker>
      </defs>
      {parts}
    </Box>
  );
}
