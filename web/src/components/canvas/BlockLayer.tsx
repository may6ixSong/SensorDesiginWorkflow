import { Box } from '@mui/material';
import { DeliverableDto, Layout } from '@/types/domain';
import { LaneGeom } from '@/lib/laneGeometry';
import { DraftMemo } from '@/store/canvasStore';
import { DeliverableNode } from './DeliverableNode';
import { MemoBlock } from './MemoBlock';

interface BlockLayerProps {
  deliverables: DeliverableDto[];
  draftLayouts: Map<string, { layout: Layout; phaseKey: string }> | null;
  memos: DraftMemo[];
  ipColor: string;
  lanes: LaneGeom[];
  zoom: number;
  isEditing: boolean;
  selectedBlockId: string | null;
  highlightedNodeIds: Set<string> | null;
  recvDeptFocus: string | null;
  onCommitLayout: (id: string, layout: Layout, phaseKey: string) => void;
  onBoundaryFlash: (laneKey: string) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onMemoChangeText: (id: string, text: string) => void;
  onMemoDelete: (id: string) => void;
}

export function BlockLayer({
  deliverables,
  draftLayouts,
  memos,
  ipColor,
  lanes,
  zoom,
  isEditing,
  selectedBlockId,
  highlightedNodeIds,
  recvDeptFocus,
  onCommitLayout,
  onBoundaryFlash,
  onSelect,
  onOpenDetail,
  onMemoChangeText,
  onMemoDelete,
}: BlockLayerProps) {
  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      {deliverables.map((d) => {
        const override = draftLayouts?.get(d.id);
        const layout = override?.layout ?? d.layout;
        const isHighlighted = !highlightedNodeIds || highlightedNodeIds.has(d.id);
        const isDimmed = highlightedNodeIds
          ? !highlightedNodeIds.has(d.id)
          : Boolean(recvDeptFocus) && d.recvDept !== recvDeptFocus;
        return (
          <DeliverableNode
            key={d.id}
            deliverable={d}
            layout={layout}
            ipColor={ipColor}
            lanes={lanes}
            zoom={zoom}
            isEditing={isEditing}
            isSelected={selectedBlockId === d.id}
            isHighlighted={isHighlighted}
            isDimmed={isDimmed}
            onCommitLayout={onCommitLayout}
            onBoundaryFlash={onBoundaryFlash}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
          />
        );
      })}

      {isEditing &&
        memos.map((m) => (
          <MemoBlock
            key={m.id}
            memo={m}
            lanes={lanes}
            zoom={zoom}
            isEditing={isEditing}
            onCommitLayout={onCommitLayout}
            onBoundaryFlash={onBoundaryFlash}
            onChangeText={onMemoChangeText}
            onDelete={onMemoDelete}
          />
        ))}
    </Box>
  );
}
