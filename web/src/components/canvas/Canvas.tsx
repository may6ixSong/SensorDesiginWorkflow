import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { DeliverableDto, EdgeDto, IpDto, Layout, MemoDto, PhaseRef } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';
import { computeLaneGeometry, laneForX, totalCanvasWidth, todayX } from '@/lib/laneGeometry';
import { computeAutoFit } from '@/lib/autoFit';
import { computeFlowHighlight } from '@/lib/flowHighlight';
import { ZOOM_STEP, LANE_TOP_PAD, LANE_MIN_HEIGHT, NW, MEMO_NH } from '@/lib/layoutConstants';
import { usePutCanvas } from '@/api/hooks/useCanvas';
import { PhaseLanes } from './PhaseLanes';
import { EdgeLayer } from './EdgeLayer';
import { BlockLayer } from './BlockLayer';
import { FloatingToolbox } from './FloatingToolbox';
import { TodayLine } from './TodayLine';
import { Legend } from './Legend';

interface CanvasProps {
  ip: IpDto;
  phases: PhaseRef[];
  deliverables: DeliverableDto[];
  memos: MemoDto[];
  edges: EdgeDto[];
  onOpenDetail: (deliverableId: string) => void;
  onRequestAddDeliverable: (phaseKey: string) => void;
}

/**
 * 보드 화면의 캔버스. 줌/팬, 자유 배치 드래그, Phase 벽 저항, Auto Fit,
 * flow 방향별 하이라이트, 편집 세션(진입→draft 편집→저장/취소)을 모두 여기서 조율한다 (설계서 3.7~3.9, 7.1).
 */
export function Canvas({ ip, phases, deliverables, memos, edges, onOpenDetail, onRequestAddDeliverable }: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [flashedLaneKey, setFlashedLaneKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const zoom = useCanvasStore((s) => s.zoom);
  const panX = useCanvasStore((s) => s.panX);
  const isEditing = useCanvasStore((s) => s.isEditing);
  const selectedBlockId = useCanvasStore((s) => s.selectedBlockId);
  const highlight = useCanvasStore((s) => s.highlight);
  const laneWidthOverrides = useCanvasStore((s) => s.laneWidthOverrides);
  const draft = useCanvasStore((s) => s.draft);
  const recvDeptFocus = useCanvasStore((s) => s.recvDeptFocus);

  const setZoom = useCanvasStore((s) => s.setZoom);
  const setPan = useCanvasStore((s) => s.setPan);
  const clampZoom = useCanvasStore((s) => s.clampZoom);
  const enterEditMode = useCanvasStore((s) => s.enterEditMode);
  const cancelEdit = useCanvasStore((s) => s.cancelEdit);
  const exitEditMode = useCanvasStore((s) => s.exitEditMode);
  const updateDraftLayout = useCanvasStore((s) => s.updateDraftLayout);
  const addDraftMemo = useCanvasStore((s) => s.addDraftMemo);
  const updateDraftMemo = useCanvasStore((s) => s.updateDraftMemo);
  const removeDraftMemo = useCanvasStore((s) => s.removeDraftMemo);
  const setLaneWidth = useCanvasStore((s) => s.setLaneWidth);
  const select = useCanvasStore((s) => s.select);
  const setHighlight = useCanvasStore((s) => s.setHighlight);

  const putCanvas = usePutCanvas(ip.id);

  const lanes = useMemo(() => computeLaneGeometry(phases, laneWidthOverrides), [phases, laneWidthOverrides]);
  const contentWidth = useMemo(() => totalCanvasWidth(lanes), [lanes]);
  const contentHeight = LANE_MIN_HEIGHT;
  const todayXPos = useMemo(() => todayX(lanes), [lanes]);

  // minZoom = viewport.width / canvasContentWidth (캔버스가 뷰포트보다 좁아지지 않게, 설계서 7.1)
  useEffect(() => {
    if (!viewportRef.current || contentWidth <= 0) return;
    const minZoom = viewportRef.current.clientWidth / contentWidth;
    clampZoom(minZoom);
  }, [contentWidth, clampZoom]);

  const draftLayouts = useMemo(() => {
    if (!draft) return null;
    const map = new Map<string, { layout: Layout; phaseKey: string }>();
    for (const d of draft.deliverables) map.set(d.id, { layout: d.layout, phaseKey: d.phaseKey });
    return map;
  }, [draft]);

  const layoutsById = useMemo(() => {
    const map = new Map<string, Layout>();
    for (const d of deliverables) {
      const override = draftLayouts?.get(d.id);
      map.set(d.id, override?.layout ?? d.layout);
    }
    return map;
  }, [deliverables, draftLayouts]);

  const edgeList = useMemo(
    () =>
      isEditing && draft
        ? draft.edges
        : edges.map((e) => ({
            id: e._id,
            fromId: e.fromId,
            toId: e.toId,
            bidirectional: e.bidirectional,
            auto: e.auto,
          })),
    [isEditing, draft, edges],
  );

  const flashBoundary = (laneKey: string) => {
    setFlashedLaneKey(laneKey);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedLaneKey(null), 350);
  };

  const handleCommitLayout = (id: string, layout: Layout, phaseKey: string) => {
    updateDraftLayout(id, layout, phaseKey);
  };

  // --- Zoom (휠, 조회 모드 전용) / Pan (트랙패드 가로 스크롤은 모드 무관) - 설계서 7.1 ---
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      setPan(panX - e.deltaX);
      return;
    }
    if (isEditing) return; // 편집 모드에서는 팬만 가능(실수 방지)
    e.preventDefault();
    setZoom(zoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP));
  };

  // --- 배경 클릭 팬 + 하이라이트 해제 ---
  const panSession = useRef<{ startX: number; startPan: number } | null>(null);
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    panSession.current = { startX: e.clientX, startPan: panX };
  };
  const onBackgroundPointerMove = (e: React.PointerEvent) => {
    if (!panSession.current) return;
    setPan(panSession.current.startPan + (e.clientX - panSession.current.startX));
  };
  const onBackgroundPointerUp = () => {
    panSession.current = null;
  };
  const onBackgroundClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    select(null);
    setHighlight(null);
  };

  // --- Flow 하이라이트 (조회 모드에서 블록 클릭, 설계서 3.9) ---
  const handleSelect = (id: string) => {
    if (selectedBlockId === id) {
      select(null);
      setHighlight(null);
      return;
    }
    select(id);
    setHighlight(computeFlowHighlight(id, edges));
  };

  // --- 편집 세션 ---
  const handleEnterEdit = () => enterEditMode(deliverables, memos, edges);
  const handleCancel = () => cancelEdit();
  const handleSave = () => {
    if (!draft) return;
    putCanvas.mutate(
      { deliverables: draft.deliverables, memos: draft.memos, edges: draft.edges },
      { onSuccess: () => exitEditMode() },
    );
  };

  const handleAddMemo = () => {
    if (!draft) return;
    const lane = lanes[0];
    if (!lane) return;
    addDraftMemo({
      id: `tmp-memo-${Date.now()}`,
      phaseKey: lane.key,
      text: '새 메모',
      layout: { x: lane.x + 24, y: LANE_TOP_PAD, w: NW, h: MEMO_NH },
    });
  };

  const handleAddDeliverable = () => {
    const lane = laneForX(lanes, panX * -1 + 40) ?? lanes[0];
    onRequestAddDeliverable(lane?.key ?? phases[0]?.key ?? '');
  };

  const handleAutoFit = () => {
    if (!draft) return;
    const blocks = draft.deliverables.map((d) => ({ id: d.id, phaseKey: d.phaseKey, layout: d.layout }));
    const result = computeAutoFit(blocks, draft.edges, lanes);
    for (const [id, layout] of result) {
      const original = draft.deliverables.find((d) => d.id === id);
      updateDraftLayout(id, layout, original?.phaseKey ?? phases[0]?.key ?? '');
    }
  };

  return (
    <Box
      ref={viewportRef}
      onWheel={onWheel}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onBackgroundPointerMove}
      onPointerUp={onBackgroundPointerUp}
      onClick={onBackgroundClick}
      sx={{
        position: 'relative',
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: contentWidth,
          height: contentHeight,
          transform: `translateX(${panX}px) scaleX(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <PhaseLanes
          lanes={lanes}
          phases={phases}
          height={contentHeight}
          zoom={zoom}
          isEditing={isEditing}
          flashedLaneKey={flashedLaneKey}
          onResizeLane={setLaneWidth}
        />
        <EdgeLayer
          edges={edgeList}
          layoutsById={layoutsById}
          width={contentWidth}
          height={contentHeight}
          isEditing={isEditing}
          highlightedEdgeIds={highlight?.edgeIds ?? null}
        />
        <BlockLayer
          deliverables={deliverables}
          draftLayouts={draftLayouts}
          memos={draft?.memos ?? []}
          ipColor={ip.color}
          lanes={lanes}
          zoom={zoom}
          isEditing={isEditing}
          selectedBlockId={selectedBlockId}
          highlightedNodeIds={highlight?.nodeIds ?? null}
          recvDeptFocus={recvDeptFocus}
          onCommitLayout={handleCommitLayout}
          onBoundaryFlash={flashBoundary}
          onSelect={handleSelect}
          onOpenDetail={onOpenDetail}
          onMemoChangeText={(id, text) => updateDraftMemo(id, { text })}
          onMemoDelete={removeDraftMemo}
        />
        <TodayLine x={todayXPos} height={contentHeight} />
      </Box>

      <FloatingToolbox
        canEdit={ip.myAccess === 'edit'}
        isEditing={isEditing}
        isSaving={putCanvas.isPending}
        onEnterEdit={handleEnterEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onAddDeliverable={handleAddDeliverable}
        onAddMemo={handleAddMemo}
        onAutoFit={handleAutoFit}
      />
      <Legend />
    </Box>
  );
}
