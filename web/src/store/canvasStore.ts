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
  incomingOverrides: Record<string, { x: number; y: number; phase: string }>;
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
  /* 현재 로드된 workflow — 서버 데이터 동기화 판단용 */
  loadedWorkflowId: string | null;
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
  /**
   * addDlg가 열릴 때 "일반 산출물 추가"인지 "내가 받아야 할 산출물 추가"인지 — 후자는
   * 생성 직후 그 산출물의 Handoff 탭을 자동으로 열어 부서/시스템 출처를 바로 채우게
   * 유도한다(BoardPage의 addDlg onCreate 핸들러 참고).
   */
  addDlgIntent: 'own' | 'received';
  hldDlg: boolean;
  hldSel: string | null;
  hldBack: boolean;
  phInfo: string | null;
  ownerDlg: boolean;
  /** Incoming 카드 클릭 시 선택된 산출물 id — 읽기 전용 상세 dialog에 쓰인다. */
  incomingId: string | null;
  /** 새로 추가된 블록 id — 설정되면 Canvas가 뷰포트를 그 블록으로 이동시키고 비운다. */
  focusReq: string | null;
  /**
   * origin==='incoming' 노드는 이 캔버스 소유가 아니라 서버에 위치를 저장할 곳이 없어
   * hydrate마다 placeIncomingNodes()가 새로 배치한다 — 그래서 사용자가 같은 Phase
   * 안에서 옮긴 위치를 기억해 두었다가 hydrate 직후 다시 덮어씌워, "옮겼는데 곧
   * 원위치로 튕겨나가는" 것처럼 보이지 않게 한다. phase가 바뀌면(다른 IP가 스케줄을
   * 바꾸면) 더 이상 유효하지 않으므로 무시한다. 세션 동안만 유지되고 서버엔 저장되지 않는다.
   */
  incomingOverrides: Record<string, { x: number; y: number; phase: string }>;
  /**
   * 이번 편집 세션(enterEdit ~ cancelEdit/exitEdit) 중에 새로 생성(POST)된 산출물 id 목록.
   * 산출물 추가는 memo/레이아웃과 달리 즉시 서버에 저장되는 동작이라(생성 버튼을 누르는
   * 순간 POST), Cancel이 로컬 상태만 스냅샷으로 되돌려서는 서버에 남은 레코드가 다음
   * refetch 때 그대로 다시 나타난다 — 그래서 Cancel 시 이 목록에 있는 id들을 실제로
   * DELETE한 뒤에 스냅샷을 복원해야 "추가를 취소"한 것이 된다(BoardPage의 onCancelEdit).
   */
  sessionAddedDeliverableIds: string[];

  setVP: (z: number, x: number, y: number) => void;
  setPan: (x: number) => void;
  hydrate: (workflowId: string, d: { nodes: CanvasNode[]; memos: CanvasMemo[]; edges: CanvasEdge[] }) => void;
  setNodes: (nodes: CanvasNode[]) => void;
  setMemos: (memos: CanvasMemo[]) => void;
  setEdges: (edges: CanvasEdge[]) => void;
  setPhasePW: (pw: Record<string, number>) => void;
  bumpBlocks: () => void;

  enterEdit: () => void;
  exitEdit: () => void;
  cancelEdit: () => void;
  trackAddedDeliverable: (id: string) => void;

  setRecv: (v: boolean) => void;
  select: (id: string | null, hl: Set<string> | null) => void;
  setLink: (id: string | null) => void;
  setLinkPos: (p: { x: number; y: number } | null) => void;
  flash: (bnd: number | null) => void;

  openDeliverable: (id: string | null, tab?: CanvasState['tab']) => void;
  setTab: (t: CanvasState['tab']) => void;
  setNoteDlg: (id: string | null) => void;
  setAddDlg: (v: boolean, intent?: CanvasState['addDlgIntent']) => void;
  setHldDlg: (v: boolean, sel?: string | null) => void;
  setHldSel: (id: string | null) => void;
  setHldBack: (v: boolean) => void;
  setPhInfo: (id: string | null) => void;
  setOwnerDlg: (v: boolean) => void;
  setIncomingId: (id: string | null) => void;
  setFocusReq: (id: string | null) => void;
  setIncomingOverride: (id: string, x: number, y: number, phase: string) => void;
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
  loadedWorkflowId: null,
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
  addDlgIntent: 'own',
  hldDlg: false,
  hldSel: null,
  hldBack: false,
  phInfo: null,
  ownerDlg: false,
  incomingId: null,
  focusReq: null,
  incomingOverrides: {},
  sessionAddedDeliverableIds: [],
  rev: 0,

  setVP: (z, x, y) => set({ z: Math.max(ZOOM_MIN, z), x, y }),
  setPan: (x) => set({ x }),

  hydrate: (workflowId, d) =>
    set((s) => ({
      loadedWorkflowId: workflowId,
      nodes: d.nodes,
      memos: d.memos,
      edges: d.edges,
      // IP가 바뀌면 레인 폭/선택/뷰포트 초기화
      phasePW: s.loadedWorkflowId === workflowId ? s.phasePW : {},
      sel: s.loadedWorkflowId === workflowId ? s.sel : null,
      hlSet: s.loadedWorkflowId === workflowId ? s.hlSet : null,
      x: s.loadedWorkflowId === workflowId ? s.x : 0,
      y: s.loadedWorkflowId === workflowId ? s.y : 0,
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
      snapshot: clone({
        nodes: s.nodes, memos: s.memos, edges: s.edges, phasePW: s.phasePW,
        incomingOverrides: s.incomingOverrides,
      }),
      link: null,
      sel: null,
      hlSet: null,
      sessionAddedDeliverableIds: [],
    });
  },
  exitEdit: () =>
    set({ edit: false, snapshot: null, link: null, sel: null, hlSet: null, sessionAddedDeliverableIds: [] }),
  cancelEdit: () => {
    const snap = get().snapshot;
    set((s) => ({
      edit: false,
      snapshot: null,
      sessionAddedDeliverableIds: [],
      link: null,
      sel: null,
      hlSet: null,
      nodes: snap ? snap.nodes : s.nodes,
      memos: snap ? snap.memos : s.memos,
      edges: snap ? snap.edges : s.edges,
      phasePW: snap ? snap.phasePW : s.phasePW,
      incomingOverrides: snap ? snap.incomingOverrides : s.incomingOverrides,
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
  setAddDlg: (v, intent) => set({ addDlg: v, addDlgIntent: intent ?? 'own' }),
  setHldDlg: (v, sel) => set({ hldDlg: v, hldSel: sel === undefined ? null : sel }),
  setHldSel: (id) => set({ hldSel: id }),
  setHldBack: (v) => set({ hldBack: v }),
  setPhInfo: (id) => set({ phInfo: id }),
  setOwnerDlg: (v) => set({ ownerDlg: v }),
  setIncomingId: (id) => set({ incomingId: id }),
  setFocusReq: (id) => set({ focusReq: id }),
  setIncomingOverride: (id, x, y, phase) =>
    set((s) => ({ incomingOverrides: { ...s.incomingOverrides, [id]: { x, y, phase } } })),
  trackAddedDeliverable: (id) =>
    set((s) => (
      s.sessionAddedDeliverableIds.includes(id)
        ? s
        : { sessionAddedDeliverableIds: [...s.sessionAddedDeliverableIds, id] }
    )),
}));
