import { create } from 'zustand';
import { CanvasEdge, CanvasMemo, CanvasNode } from '@/lib/canvasModel';
import { ZOOM_MIN } from '@/lib/constants';

/**
 * 클라이언트 전용 상태 (목업의 VP + S). 서버로 보내지 않는다 (설계서 7.1).
 * 편집 진입 시 nodes/memos/edges/phasePW를 스냅샷으로 떠두고, 취소하면 그대로 복원한다.
 */
export interface CanvasSnapshot {
  nodes: CanvasNode[];
  memos: CanvasMemo[];
  edges: CanvasEdge[];
  phasePW: Record<string, number>;
}

interface CanvasState {
  /* viewport — 가로/세로 동일 배율 스케일 + 2축 팬 */
  z: number;
  x: number;
  y: number;
  /* 작업 데이터 */
  nodes: CanvasNode[];
  memos: CanvasMemo[];
  edges: CanvasEdge[];
  phasePW: Record<string, number>;
  /* 현재 로드된 IP — 서버 데이터 동기화 판단용 */
  loadedIpId: string | null;
  /* 상호작용 */
  edit: boolean;
  recv: boolean;
  sel: string | null;
  hlSet: Set<string> | null;
  link: string | null;
  linkPos: { x: number; y: number } | null;
  flashBnd: number | null;
  snapshot: CanvasSnapshot | null;
  /* dialog */
  openId: string | null;
  tab: 'overview' | 'versions' | 'recv';
  noteDlg: string | null;
  addDlg: boolean;
  hldDlg: boolean;
  hldSel: string | null;
  hldBack: boolean;
  phInfo: string | null;
  ownerDlg: boolean;
  /** 새로 추가된 블록 id — 설정되면 Canvas가 뷰포트를 그 블록으로 이동시키고 비운다. */
  focusReq: string | null;

  setVP: (z: number, x: number, y: number) => void;
  setPan: (x: number) => void;
  hydrate: (ipId: string, d: { nodes: CanvasNode[]; memos: CanvasMemo[]; edges: CanvasEdge[] }) => void;
  setNodes: (nodes: CanvasNode[]) => void;
  setMemos: (memos: CanvasMemo[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setPhasePW: (pw: Record<string, number>) => void;
  bumpBlocks: () => void;

  enterEdit: () => void;
  exitEdit: () => void;
  cancelEdit: () => void;

  setRecv: (v: boolean) => void;
  select: (id: string | null, hl: Set<string> | null) => void;
  setLink: (id: string | null) => void;
  setLinkPos: (p: { x: number; y: number } | null) => void;
  flash: (bnd: number | null) => void;

  openDeliverable: (id: string | null, tab?: CanvasState['tab']) => void;
  setTab: (t: CanvasState['tab']) => void;
  setNoteDlg: (id: string | null) => void;
  setAddDlg: (v: boolean) => void;
  setHldDlg: (v: boolean, sel?: string | null) => void;
  setHldSel: (id: string | null) => void;
  setHldBack: (v: boolean) => void;
  setPhInfo: (id: string | null) => void;
  setOwnerDlg: (v: boolean) => void;
  setFocusReq: (id: string | null) => void;
  /** 블록 재렌더 트리거용 카운터 (드래그 커밋 후 등) */
  rev: number;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useCanvasStore = create<CanvasState>((set, get) => ({
  z: 1,
  x: 0,
  y: 0,
  nodes: [],
  memos: [],
  edges: [],
  phasePW: {},
  loadedIpId: null,
  edit: false,
  recv: false,
  sel: null,
  hlSet: null,
  link: null,
  linkPos: null,
  flashBnd: null,
  snapshot: null,
  openId: null,
  tab: 'overview',
  noteDlg: null,
  addDlg: false,
  hldDlg: false,
  hldSel: null,
  hldBack: false,
  phInfo: null,
  ownerDlg: false,
  focusReq: null,
  rev: 0,

  setVP: (z, x, y) => set({ z: Math.max(ZOOM_MIN, z), x, y }),
  setPan: (x) => set({ x }),

  hydrate: (ipId, d) =>
    set((s) => ({
      loadedIpId: ipId,
      nodes: d.nodes,
      memos: d.memos,
      edges: d.edges,
      // IP가 바뀌면 레인 폭/선택/뷰포트 초기화
      phasePW: s.loadedIpId === ipId ? s.phasePW : {},
      sel: s.loadedIpId === ipId ? s.sel : null,
      hlSet: s.loadedIpId === ipId ? s.hlSet : null,
      x: s.loadedIpId === ipId ? s.x : 0,
      y: s.loadedIpId === ipId ? s.y : 0,
      rev: s.rev + 1,
    })),

  setNodes: (nodes) => set((s) => ({ nodes, rev: s.rev + 1 })),
  setMemos: (memos) => set((s) => ({ memos, rev: s.rev + 1 })),
  setEdges: (edges) => set((s) => ({ edges, rev: s.rev + 1 })),
  setPhasePW: (phasePW) => set((s) => ({ phasePW, rev: s.rev + 1 })),
  bumpBlocks: () => set((s) => ({ rev: s.rev + 1 })),

  enterEdit: () => {
    const s = get();
    set({
      edit: true,
      snapshot: clone({ nodes: s.nodes, memos: s.memos, edges: s.edges, phasePW: s.phasePW }),
      link: null,
      sel: null,
      hlSet: null,
    });
  },
  exitEdit: () => set({ edit: false, snapshot: null, link: null, sel: null, hlSet: null }),
  cancelEdit: () => {
    const snap = get().snapshot;
    set((s) => ({
      edit: false,
      snapshot: null,
      link: null,
      sel: null,
      hlSet: null,
      nodes: snap ? snap.nodes : s.nodes,
      memos: snap ? snap.memos : s.memos,
      edges: snap ? snap.edges : s.edges,
      phasePW: snap ? snap.phasePW : s.phasePW,
      rev: s.rev + 1,
    }));
  },

  setRecv: (v) => set({ recv: v, edit: false }),
  select: (id, hl) => set({ sel: id, hlSet: hl }),
  setLink: (id) => set({ link: id, linkPos: null }),
  setLinkPos: (p) => set({ linkPos: p }),
  flash: (bnd) => set({ flashBnd: bnd }),

  openDeliverable: (id, tab) => set({ openId: id, tab: tab ?? 'overview' }),
  setTab: (t) => set({ tab: t }),
  setNoteDlg: (id) => set({ noteDlg: id }),
  setAddDlg: (v) => set({ addDlg: v }),
  setHldDlg: (v, sel) => set({ hldDlg: v, hldSel: sel === undefined ? null : sel }),
  setHldSel: (id) => set({ hldSel: id }),
  setHldBack: (v) => set({ hldBack: v }),
  setPhInfo: (id) => set({ phInfo: id }),
  setOwnerDlg: (v) => set({ ownerDlg: v }),
  setFocusReq: (id) => set({ focusReq: id }),
}));
