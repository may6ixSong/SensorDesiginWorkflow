import { Box } from '@mui/material';
import { Layout } from '@/types/domain';
import { DraftEdge } from '@/store/canvasStore';
import { computeOrthPath, pathMidpoint, pathToSvgD } from '@/lib/orthRouting';
import { tokens } from '@/theme/theme';

interface EdgeLayerProps {
  edges: DraftEdge[];
  layoutsById: Map<string, Layout>;
  width: number;
  height: number;
  isEditing: boolean;
  highlightedEdgeIds: Set<string> | null;
}

/**
 * 연결선(flow) 렌더링 (설계서 3.9).
 * - 직교(수직/수평) 라우팅만 사용, 곡선 없음.
 * - 양방향: 양쪽 화살촉 + 선 중앙에 순환 아이콘(주황색, 배경/테두리 없음), 편집 모드에서는 숨김.
 * - 하이라이트: 점선이 흐르는 애니메이션, 원래 실선은 옅게.
 */
export function EdgeLayer({ edges, layoutsById, width, height, isEditing, highlightedEdgeIds }: EdgeLayerProps) {
  return (
    <Box
      component="svg"
      width={width}
      height={height}
      sx={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <defs>
        <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={tokens.edgeDefault} />
        </marker>
        <marker id="arrow-highlight" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={tokens.edgeHighlight} />
        </marker>
        <marker id="arrow-bidir" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={tokens.edgeBidirectional} />
        </marker>
      </defs>

      <style>
        {`
          @keyframes arbor-flow-dash {
            to { stroke-dashoffset: -24; }
          }
          .arbor-edge-highlighted {
            stroke-dasharray: 6 6;
            animation: arbor-flow-dash 0.6s linear infinite;
          }
        `}
      </style>

      {edges.map((edge) => {
        const from = layoutsById.get(edge.fromId);
        const to = layoutsById.get(edge.toId);
        if (!from || !to) return null;

        const points = computeOrthPath(from, to);
        const d = pathToSvgD(points);
        const isHighlighted = highlightedEdgeIds?.has(edge.id) ?? false;
        const isDimmed = Boolean(highlightedEdgeIds) && !isHighlighted;

        const stroke = edge.bidirectional
          ? tokens.edgeBidirectional
          : isHighlighted
            ? tokens.edgeHighlight
            : tokens.edgeDefault;
        const marker = edge.bidirectional ? 'arrow-bidir' : isHighlighted ? 'arrow-highlight' : 'arrow-default';

        const midpoint = pathMidpoint(points);

        return (
          <g key={edge.id} opacity={isDimmed ? 0.25 : 1}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={isHighlighted ? 2 : 1.5}
              className={isHighlighted ? 'arbor-edge-highlighted' : undefined}
              markerEnd={`url(#${marker})`}
              markerStart={edge.bidirectional ? `url(#${marker})` : undefined}
            />
            {edge.bidirectional && !isEditing && (
              <g transform={`translate(${midpoint.x}, ${midpoint.y})`}>
                <path
                  d="M -5 0 A 5 5 0 1 1 0 5 M 0 5 L -2 3 M 0 5 L 2 3.5"
                  fill="none"
                  stroke={tokens.edgeBidirectional}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}
    </Box>
  );
}
