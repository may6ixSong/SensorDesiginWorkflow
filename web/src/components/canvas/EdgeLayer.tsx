import { Box } from '@mui/material';
import { CanvasEdge, CanvasNode, biIconPos, latR, orth, stOf } from '@/lib/canvasModel';

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
    const col = on ? '#0c9a83' : blocked ? '#ac6f08' : '#8b99ab';
    const mk = on ? 'ahl' : blocked ? 'ahb' : 'ah';
    const dpath = orth(a, b);

    parts.push(
      <path
        key={`${e.id}-main`}
        d={dpath}
        stroke={col}
        strokeWidth={on ? 2.1 : 1.6}
        fill="none"
        markerEnd={`url(#${mk})`}
        markerStart={bi ? `url(#${on ? 'ahl-s' : 'ah-s'})` : undefined}
        strokeDasharray={blocked ? '5 4' : undefined}
        shapeRendering="crispEdges"
      />,
    );

    if (on) {
      parts.push(
        <path key={`${e.id}-bg`} d={dpath} stroke={col} strokeWidth={1.6} fill="none" opacity={0.18} shapeRendering="crispEdges" />,
        <path
          key={`${e.id}-dash`}
          d={dpath}
          stroke="#0c9a83"
          strokeWidth={2.2}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="8 10"
          style={{ animation: 'flowdash .65s linear infinite' }}
          markerEnd="url(#ahl)"
        />,
      );
    }

    if (bi && !edit) {
      const c = biIconPos(a, b);
      parts.push(
        <g key={`${e.id}-cyc`} transform={`translate(${c.x - 11},${c.y - 11})`} pointerEvents="none">
          <path d="M16.8 9.8A5.4 5.4 0 0 0 6.8 8.9" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" />
          <path d="M5.2 13.2a5.4 5.4 0 0 0 9.8 1.1" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" />
          <path d="M17 6v3.8h-3.8" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 16v-3.8h3.8" stroke="#bc4f1a" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>,
      );
    }

    if (edit && canEdit) {
      parts.push(
        <path
          key={`${e.id}-hit`}
          d={dpath}
          stroke="transparent"
          strokeWidth={12}
          fill="none"
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onClick={(ev) => {
            ev.stopPropagation();
            onDeleteEdge(e.id);
          }}
        >
          <title>Click to remove this link</title>
        </path>,
      );
    }
  });

  // 연결 중 커서를 따라가는 안내선
  if (link && byId.get(link) && linkPos) {
    const a = byId.get(link)!;
    parts.push(
      <path
        key="linkline"
        d={`M${a.x + a.w},${Math.round(a.y + a.h / 2)}H${linkPos.x}V${linkPos.y}`}
        stroke="#0c9a83"
        strokeWidth={1.6}
        strokeDasharray="5 4"
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
        <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0L8,4L0,8Z" fill="#8b99ab" />
        </marker>
        <marker id="ahb" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0L8,4L0,8Z" fill="#ac6f08" />
        </marker>
        <marker id="ahl" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0L8,4L0,8Z" fill="#0c9a83" />
        </marker>
        <marker id="ah-s" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
          <path d="M8,0L0,4L8,8Z" fill="#8b99ab" />
        </marker>
        <marker id="ahl-s" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
          <path d="M8,0L0,4L8,8Z" fill="#0c9a83" />
        </marker>
      </defs>
      {parts}
    </Box>
  );
}
