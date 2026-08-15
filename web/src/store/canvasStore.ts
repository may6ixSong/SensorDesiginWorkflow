import { create } from 'zustand';
import { DeliverableDto, EdgeDto, Layout, MemoDto } from '@/types/domain';
import { ZOOM_MAX, ZOOM_MIN } from '@/lib/layoutConstants';

export interface DraftDeliverable {
  id: string;
  layout: Layout;
  phaseKey: string;
}

export interface DraftMemo {
  id: string;
  phaseKey: string;
  text: string;
  layout: Layout;
}

export interface DraftEdge {
  id: string;
  fromId: string;
  toId: string;
  bidirectional: boolean;
  auto: boolean;
}

interface EditDraft {
  deliverables: DraftDeliverable[];
  memos: DraftMemo[];
  edges: DraftEdge[];
}

interface HighlightState {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * 클라이언트 전용 상태 (줌/팬, 편집모드, 선택/하이라이트) - 서버로 보내지 않는다 (설계서 7.1).
 * 편집 진입 시 draft/editSnapshot에 서버 상태 스냅샷을 복제해두고, 취소 시 draft를
 * editSnapshot으로 되돌려 API 호출 없이 종료한다. 저장 시에만 draft를 PUT /canvas로 보낸다.
 */
interface CanvasState {
  zoom: number;
  panX: number;
  isEditing: boolean;
  selectedBlockId: string | null;
  highlight: HighlightState | null;
  laneWidthOverrides: Record<string, number>;
  draft: EditDraft | null;
  editSnapshot: EditDraft | null;
  /** AppShell의 "수신부서 시점 토글" - 선택된 부서가 recvDept인 산출물만 강조한다 (설계서 7.1 컴포넌트 트리). */
  recvDeptFocus: string | null;
  setRecvDeptFocus: (dept: string | null) => void;

  setZoom: (zoom: number) => void;
  setPan: (panX: number) => void;
  clampZoom: (minZoom: number) => void;

  enterEditMode: (deliverables: DeliverableDto[], memos: MemoDto[], edges: EdgeDto[]) => void;
  cancelEdit: () => void;
  exitEditMode: () => void;

  updateDraftLayout: (id: string, layout: Layout, phaseKey: string) => void;
  addDraftMemo: (memo: DraftMemo) => void;
  updateDraftMemo: (id: string, patch: Partial<Omit<DraftMemo, 'id'>>) => void;
  removeDraftMemo: (id: string) => void;
  addDraftEdge: (edge: DraftEdge) => void;
  removeDraftEdge: (id: string) => void;

  setLaneWidth: (phaseKey: string, width: number) => void;

  select: (blockId: string | null) => void;
  setHighlight: (highlight: HighlightState | null) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  zoom: 1,
  panX: 0,
  isEditing: false,
  selectedBlockId: null,
  highlight: null,
  laneWidthOverrides: {},
  draft: null,
  editSnapshot: null,
  recvDeptFocus: null,
  setRecvDeptFocus: (dept) => set({ recvDeptFocus: dept }),

  setZoom: (zoom) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) }),
  setPan: (panX) => set({ panX }),
  clampZoom: (minZoom) => set((s) => ({ zoom: Math.max(minZoom, s.zoom) })),

  enterEditMode: (deliverables, memos, edges) => {
    const draft: EditDraft = {
      deliverables: deliverables.map((d) => ({ id: d.id, layout: { ...d.layout }, phaseKey: d.phaseKey })),
      memos: memos.map((m) => ({ id: m._id, phaseKey: m.phaseKey, text: m.text, layout: { ...m.layout } })),
      edges: edges.map((e) => ({
        id: e._id,
        fromId: e.fromId,
        toId: e.toId,
        bidirectional: e.bidirectional,
        auto: e.auto,
      })),
    };
    set({
      isEditing: true,
      draft,
      editSnapshot: JSON.parse(JSON.stringify(draft)),
      selectedBlockId: null,
      highlight: null,
    });
  },

  cancelEdit: () => {
    const snapshot = get().editSnapshot;
    set({ isEditing: false, draft: snapshot, editSnapshot: null });
  },

  exitEditMode: () => set({ isEditing: false, draft: null, editSnapshot: null }),

  updateDraftLayout: (id, layout, phaseKey) =>
    set((s) => {
      if (!s.draft) return s;
      const deliverables = s.draft.deliverables.map((d) => (d.id === id ? { ...d, layout, phaseKey } : d));
      return { draft: { ...s.draft, deliverables } };
    }),

  addDraftMemo: (memo) =>
    set((s) => (s.draft ? { draft: { ...s.draft, memos: [...s.draft.memos, memo] } } : s)),

  updateDraftMemo: (id, patch) =>
    set((s) => {
      if (!s.draft) return s;
      const memos = s.draft.memos.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return { draft: { ...s.draft, memos } };
    }),

  removeDraftMemo: (id) =>
    set((s) => (s.draft ? { draft: { ...s.draft, memos: s.draft.memos.filter((m) => m.id !== id) } } : s)),

  addDraftEdge: (edge) =>
    set((s) => (s.draft ? { draft: { ...s.draft, edges: [...s.draft.edges, edge] } } : s)),

  removeDraftEdge: (id) =>
    set((s) => (s.draft ? { draft: { ...s.draft, edges: s.draft.edges.filter((e) => e.id !== id) } } : s)),

  setLaneWidth: (phaseKey, width) =>
    set((s) => ({ laneWidthOverrides: { ...s.laneWidthOverrides, [phaseKey]: width } })),

  select: (blockId) => set({ selectedBlockId: blockId }),
  setHighlight: (highlight) => set({ highlight }),
}));
