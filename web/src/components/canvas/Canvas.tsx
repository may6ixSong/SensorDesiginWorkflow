import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { IpBriefDto, IpDto, PhaseRef } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';
import { toast } from '@/store/toastStore';
import {
  CanvasEdge, CanvasMemo, CanvasNode, connectedSet, laneG, getPW, phaseAtX,
  resizePhase, wallAdj, todayX, autoFit as computeAutoFit,
  resolveNodePhases,
} from '@/lib/canvasModel';
import {
  CANVAS_TAIL, CH, MAXH, MAXW, MINH, MINW, PAD, ZOOM_DEFAULT_FLOOR, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, snp,
} from '@/lib/constants';
import { FONT_MONO, T } from '@/theme/tokens';
import { PhaseStepper } from './PhaseStepper';
import { EdgeLayer } from './EdgeLayer';
import { DeliverableNode } from './DeliverableNode';
import { MemoBlock } from './MemoBlock';
import { Toolbox } from './Toolbox';
import { Legend } from './Legend';

interface Props {
  ip: IpDto;
  phases: PhaseRef[];
  canEdit: boolean;
  /** origin==='incoming'인 노드를 열 때(읽기 전용 상세) 호출된다. */
  onOpenIncoming: (id: string) => void;
  /** "다른 IP에 준다" 배지(→ IP명) 해석용 — 과제 소속 IP 전체(id/name/color). */
  ipDirectory: IpBriefDto[];
  /** 저장 완료(성공/실패 무관) 후 호출할 콜백을 받는다 — 편집 종료를 저장 이후로 미뤄 쿼리 재활성화 레이스를 막는다. */
  onSaveLayout: (onSettled: () => void) => void;
}

type Blk = CanvasNode | CanvasMemo;

/**
 * 보드 캔버스 — 목업 render()/bindAll()의 이벤트 전체를 이식했다.
 * 줌/팬, 자유 드래그 + Phase 벽 저항, grip 리사이즈, pin 연결, Phase 레인 폭 조절,
 * flow 하이라이트, Auto Fit 이 모두 여기서 완결된다 (설계서 3.7~3.9, 7.1).
 */
export function Canvas({ ip, phases, canEdit, onOpenIncoming, ipDirectory, onSaveLayout }: Props) {
  const ipById = useMemo(() => new Map(ipDirectory.map((d) => [d.id, d])), [ipDirectory]);
  const vpRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLDivElement>(null);
  const elRefs = useRef(new Map<string, HTMLDivElement>());

  const z = useCanvasStore((s) => s.z);
  const panX = useCanvasStore((s) => s.x);
  const panY = useCanvasStore((s) => s.y);
  const nodes = useCanvasStore((s) => s.nodes);
  const memos = useCanvasStore((s) => s.memos);
  const edges = useCanvasStore((s) => s.edges);
  const phasePW = useCanvasStore((s) => s.phasePW);
  const edit = useCanvasStore((s) => s.edit);
  const sel = useCanvasStore((s) => s.sel);
  const hlSet = useCanvasStore((s) => s.hlSet);
  const link = useCanvasStore((s) => s.link);
  const linkPos = useCanvasStore((s) => s.linkPos);
  const rev = useCanvasStore((s) => s.rev);
  const focusReq = useCanvasStore((s) => s.focusReq);

  const st = useCanvasStore;

  /* ── geometry ── */
  const { lanes, total } = useMemo(() => laneG(phases, phasePW), [phases, phasePW]);
  const W = total + CANVAS_TAIL;
  const lowest = useMemo(
    () => [...nodes, ...memos].reduce((m, b) => Math.max(m, b.y + b.h), 0),
    [nodes, memos, rev],
  );
  const H = Math.max(CH, lowest + 160);
  const tx = useMemo(() => todayX(phases, phasePW), [phases, phasePW]);

  const allBlocks = useCallback((): Blk[] => [...st.getState().nodes, ...st.getState().memos], [st]);

  // today centering을 위해 nodes가 처음 도착한 IP를 추적한다.
  const centeredForRef = useRef<string | null>(null);

  /* ── zoom clamp ──
   * 최소 줌은 ZOOM_MIN 고정 하한만 둔다.
   * canvas가 viewport보다 작을 때는 edge에 붙이지 않고 가운데에 띄운다.
   * canvas가 viewport보다 클 때는 기존처럼 edge-clamp(스크롤 가능). */
  const minZoom = useCallback(() => ZOOM_MIN, []);

  const clampVP = useCallback(
    (nz: number, nx: number, ny: number) => {
      const vp = vpRef.current;
      const mz = minZoom();
      const zz = Math.max(mz, Math.min(Math.max(ZOOM_MAX, mz), nz));
      if (!vp) return { z: zz, x: nx, y: ny };
      const fitW = vp.clientWidth - W * zz;
      const fitH = vp.clientHeight - H * zz;
      // 캔버스가 뷰포트보다 작으면 중앙 정렬; 크면 edge-clamp
      const xx = fitW >= 0 ? fitW / 2 : Math.min(0, Math.max(fitW, nx));
      const yy = fitH >= 0 ? fitH / 2 : Math.min(0, Math.max(fitH, ny));
      return { z: zz, x: xx, y: yy };
    },
    [minZoom, W, H],
  );

  // IP가 바뀔 때: hydrate()가 x/y를 0으로 초기화한 뒤 nodes가 도착하면 today 중앙으로 이동.
  // hydrate는 데이터 쿼리가 해결된 후에 호출되므로, ip.id 변화 시점보다 늦게 실행된다.
  // → nodes.length > 0 을 함께 감지해, 데이터 도착 이후에 한 번만 센터링한다.
  const hasNodes = nodes.length > 0;
  useEffect(() => {
    if (!hasNodes) return;
    if (centeredForRef.current === ip.id) return; // 이미 이 IP에 대해 센터링 완료
    centeredForRef.current = ip.id;
    const vp = vpRef.current;
    if (!vp) return;
    const todayCanvas = tx ?? W / 2;
    const containZ = Math.min(vp.clientWidth / W, vp.clientHeight / H, ZOOM_MAX);
    const fitZ = Math.max(ZOOM_MIN, Math.max(containZ, ZOOM_DEFAULT_FLOOR));
    const c = clampVP(fitZ, vp.clientWidth / 2 - todayCanvas * fitZ, 0);
    st.getState().setVP(c.z, c.x, c.y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip.id, hasNodes]);

  // 윈도우 리사이즈 or 캔버스 크기 변화 시 현재 줌/팬을 재클램프
  useEffect(() => {
    const refit = () => {
      const s = st.getState();
      const c = clampVP(s.z, s.x, s.y);
      s.setVP(c.z, c.x, c.y);
    };
    refit();
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [clampVP, st]);

  const cvPt = (e: { clientX: number; clientY: number }) => {
    const cv = cvRef.current!;
    const r = cv.getBoundingClientRect();
    const zz = st.getState().z;
    return { x: (e.clientX - r.left) / zz, y: (e.clientY - r.top) / zz };
  };

  /* ── WHEEL ZOOM — 조회 모드에서만 (설계서 7.1) ── */
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      const s = st.getState();
      e.preventDefault();
      // 편집 중이거나 shift+휠 → 줌 대신 화면 이동 (뷰포트는 overflow:hidden 이라 네이티브 스크롤이 없다)
      if (s.edit || e.shiftKey) {
        const c = e.shiftKey
          ? clampVP(s.z, s.x - e.deltaY, s.y)
          : clampVP(s.z, s.x - e.deltaX, s.y - e.deltaY);
        s.setVP(c.z, c.x, c.y);
        return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 횡 휠 무시
      const r = vp.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const dz = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nz = s.z + dz;
      // 커서 아래 캔버스 좌표를 고정한 채로 확대/축소 (가로·세로 동시)
      const pre = clampVP(nz, s.x, s.y).z;
      const k = pre / s.z;
      const c = clampVP(pre, mx - (mx - s.x) * k, my - (my - s.y) * k);
      s.setVP(c.z, c.x, c.y);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [clampVP, minZoom, st]);

  /* ── PAN — 빈 캔버스 좌드래그 / 휠 버튼 ── */
  const panRef = useRef<{ startX: number; startY: number; pid: number } | null>(null);
  // 팬 드래그가 실제로 화면을 움직였는지 — pointerup 다음에 발생하는 click까지 살아있어야
  // 하므로 endPan에서 지우지 않고 onVpClick이 소비한 뒤 리셋한다(설계서 3.9 선택 해제 규칙 보강:
  // "배경 클릭"만 선택을 풀어야지, 드래그로 화면 이동한 것까지 클릭으로 잡히면 안 된다).
  const panMovedRef = useRef(false);
  const onVpPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current || phResizeRef.current) return;
    const target = e.target as HTMLElement;
    // 버튼 안의 <svg> 아이콘도 target이 될 수 있다. 여기서 포인터를 캡처해버리면
    // 버튼의 click이 아예 발생하지 않으므로 버튼 위에서는 팬을 시작하지 않는다.
    if (target.closest('button')) return;
    const isMiddle = e.button === 1;
    const isEmptyLeft =
      e.button === 0 &&
      (target === vpRef.current ||
        target === cvRef.current ||
        target.dataset.lane !== undefined ||
        target.tagName.toLowerCase() === 'svg');
    if (!isMiddle && !isEmptyLeft) return;
    e.preventDefault();
    panMovedRef.current = false;
    panRef.current = {
      startX: e.clientX - st.getState().x,
      startY: e.clientY - st.getState().y,
      pid: e.pointerId,
    };
    vpRef.current?.setPointerCapture(e.pointerId);
    if (vpRef.current) vpRef.current.style.cursor = 'grabbing';
  };
  const onVpPointerMove = (e: React.PointerEvent) => {
    const s = st.getState();
    if (s.link) s.setLinkPos(cvPt(e));
    const p = panRef.current;
    if (!p || p.pid !== e.pointerId) return;
    panMovedRef.current = true;
    const c = clampVP(s.z, e.clientX - p.startX, e.clientY - p.startY);
    s.setVP(c.z, c.x, c.y);
  };
  const endPan = (e: React.PointerEvent) => {
    if (!panRef.current || panRef.current.pid !== e.pointerId) return;
    panRef.current = null;
    if (vpRef.current) vpRef.current.style.cursor = '';
  };

  /* ── 배경 클릭 → 선택/연결 해제 (드래그로 화면을 옮긴 경우는 제외) ── */
  const onVpClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-bid]') || target.closest('button')) return;
    if (panMovedRef.current) {
      panMovedRef.current = false;
      return;
    }
    const s = st.getState();
    if (s.link) s.setLink(null);
    else if (s.sel || s.hlSet) s.select(null, null);
  };

  /* ── BLOCK DRAG (목업 pointerdown/move/up + accX 벽 저항) ── */
  const dragRef = useRef<{
    id: string; el: HTMLDivElement; dx: number; dy: number; moved: boolean; accX: number;
    /** origin==='incoming' 노드가 Phase를 벗어나 원위치로 되돌려야 할 때 쓰는 드래그 시작 위치. */
    origX: number; origY: number;
  } | null>(null);

  const findBlk = (id: string): Blk | undefined =>
    st.getState().nodes.find((n) => n.id === id) ?? st.getState().memos.find((m) => m.id === id);

  /* ── 새로 추가된 블록으로 뷰포트 이동 ──
   * 새 산출물/메모는 현재 스크롤 위치와 무관하게 추가되므로(Phase 레인 기준 배치),
   * 화면 밖에 생겨도 사용자 눈에 보이도록 뷰포트를 그 블록 중심으로 이동시킨다. */
  useEffect(() => {
    if (!focusReq) return;
    const b = findBlk(focusReq);
    const vp = vpRef.current;
    if (b && vp) {
      const s = st.getState();
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const c = clampVP(s.z, vp.clientWidth / 2 - cx * s.z, vp.clientHeight / 2 - cy * s.z);
      s.setVP(c.z, c.x, c.y);
    }
    st.getState().setFocusReq(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  const onBlockPointerDown = (id: string) => (e: React.PointerEvent) => {
    const s = st.getState();
    if (!s.edit || !canEdit) return;
    const t = e.target as HTMLElement;
    if (t.dataset.pin !== undefined || t.dataset.grip !== undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const b = findBlk(id);
    const el = elRefs.current.get(id);
    if (!b || !el) return;
    const p = cvPt(e);
    dragRef.current = {
      id, el, dx: p.x - b.x, dy: p.y - b.y, moved: false, accX: 0, origX: b.x, origY: b.y,
    };
    // origin==='incoming' 노드도 같은 Phase 안에서는 실제로 옮길 수 있다 — 드래그 비주얼도 동일하게 준다.
    el.style.transition = 'none';
    el.style.zIndex = '30';
    el.style.cursor = 'grabbing';
    el.setPointerCapture(e.pointerId);
  };

  const onBlockPointerMove = (id: string) => (e: React.PointerEvent) => {
    const D = dragRef.current;
    if (!D || D.id !== id) return;
    const s = st.getState();
    const b = findBlk(id);
    if (!b) return;
    const p = cvPt(e);
    const rawX = Math.max(PAD, Math.min(W - b.w - PAD, p.x - D.dx));
    // 위쪽엔 벽을 두지 않는다 — 기본 배치(TOP_PAD=40)와 최소 여백(PAD=8) 사이 32px밖에
    // 안 남아 "위로 이동이 안 된다"고 느껴졌던 문제. Phase 이름 라벨과 겹치더라도
    // 캔버스 맨 위(y<0)까지 자유롭게 끌어올릴 수 있게 한다.
    const rawY = Math.min(H - b.h - PAD, p.y - D.dy);
    D.moved = true;
    // origin==='incoming' 노드는 다른 IP 소유라 Phase 벽 물리(wallAdj)를 적용하지 않고
    // 자유롭게 옮기기만 한다 — Phase를 실제로 벗어났는지는 놓는 순간(pointerUp)에만
    // 검사해서 벗어났으면 alert 후 원위치로 되돌린다.
    if ('origin' in b && b.origin === 'incoming') {
      b.x = snp(rawX);
      b.y = snp(rawY);
      s.bumpBlocks();
      return;
    }
    D.accX += rawX - b.x;
    const adj = wallAdj(phases, s.phasePW, b.x, b.w, rawX, D.accX);
    const nx = snp(adj.x);
    if (nx !== snp(rawX)) D.accX = 0;
    if (adj.crossed !== null) s.flash(adj.crossed);
    const ny = snp(rawY);
    b.x = nx;
    b.y = ny;
    // 위치는 style prop으로 렌더되므로 상태만 갱신하면 블록과 엣지가 함께 따라온다.
    s.bumpBlocks();
  };

  const onBlockPointerUp = (id: string) => (e: React.PointerEvent) => {
    const D = dragRef.current;
    if (!D || D.id !== id) return;
    const s = st.getState();
    D.el.style.cursor = '';
    D.el.style.zIndex = '';
    D.el.style.transition = '';
    try { D.el.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
    const moved = D.moved;
    dragRef.current = null;
    s.flash(null);

    const b = findBlk(id);
    if (!b) return;

    if (moved) {
      // origin==='incoming' 노드: 같은 Phase 안에서는 자유롭게 옮길 수 있지만, 다른
      // Phase로 넘어가면 이 IP가 결정할 수 있는 스케줄이 아니므로 alert 후 드래그
      // 시작 위치로 되돌린다. Phase 안에 머물렀으면 서버엔 저장하지 않고(이 캔버스
      // 소유가 아니므로) 세션 동안만 유지되는 override로 기억해 hydrate 후에도 유지되게 한다.
      if ('origin' in b && b.origin === 'incoming') {
        const cx = b.x + b.w / 2;
        const np = phaseAtX(phases, s.phasePW, cx);
        if (np !== b.phase) {
          alert("Can't move a received deliverable out of its phase.");
          b.x = D.origX;
          b.y = D.origY;
        } else {
          s.setIncomingOverride(id, b.x, b.y, b.phase);
        }
        s.bumpBlocks();
        return;
      }
      // 메모는 Phase 사이 어디든 걸쳐 있어도 무방 — 놓인 위치의 레인으로 소속만 갱신한다.
      // 겹침은 이제 허용되므로(사용자 요청) 다른 블록을 밀어내는 재배치(reflowLane)는
      // 절대 하지 않는다 — 내가 옮긴 블록 외에는 아무것도 움직이지 않아야 한다.
      if (st.getState().memos.some((m) => m.id === id)) {
        const cx = b.x + b.w / 2;
        const np = phaseAtX(phases, s.phasePW, cx);
        if (np && np !== b.phase) {
          b.phase = np;
          toast(`Moved to ${(phases.find((p) => p.key === np) || { key: '' }).key}`);
        }
      }
      s.bumpBlocks();
      return;
    }

    // 이동 없이 클릭한 경우 (편집 모드)
    if (s.link && s.link !== id) {
      const target = st.getState().nodes.find((n) => n.id === id);
      if (target && target.origin === 'incoming') {
        toast("Can't link into a received artifact — link from it instead");
        s.setLink(null);
        return;
      }
      if (target) {
        if (!s.edges.some((x) => x.from === s.link && x.to === id)) {
          s.setEdges([
            ...s.edges,
            { id: `tmp-${Date.now()}`, from: s.link!, to: id, auto: false, bidirectional: false },
          ]);
        }
        s.setLink(null);
        toast('Linked');
        return;
      }
    }
    if (st.getState().memos.some((m) => m.id === id)) {
      s.setNoteDlg(id);
      return;
    }
    s.select(s.sel === id ? null : id, null);
  };

  /* ── VIEW 모드 클릭 → 선택 + flow 하이라이트 (설계서 3.9) ── */
  const onBlockClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const s = st.getState();
    if (s.edit) return;
    if (s.sel === id) s.select(null, null);
    else s.select(id, connectedSet(id, s.edges));
  };

  /* ── GRIP RESIZE ── */
  const gripRef = useRef<{ id: string; ox: number; oy: number; pid: number } | null>(null);
  const onGripDown = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const b = findBlk(id);
    if (!b) return;
    const p = cvPt(e);
    gripRef.current = { id, ox: p.x - b.w, oy: p.y - b.h, pid: e.pointerId };
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const g = gripRef.current;
      if (!g) return;
      const q = cvPt(ev);
      const nb = findBlk(g.id);
      if (!nb) return;
      const nw = snp(Math.max(MINW, Math.min(MAXW, q.x - g.ox)));
      const nh = snp(Math.max(MINH, Math.min(MAXH, q.y - g.oy)));
      if (nw === nb.w && nh === nb.h) return;
      nb.w = nw;
      nb.h = nh;
      st.getState().bumpBlocks();
    };
    const up = () => {
      gripRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      st.getState().bumpBlocks();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ── PHASE RESIZE (스텝퍼 / 레인 양쪽 핸들) ── */
  const phResizeRef = useRef<{ pid: string; startX: number; startW: number } | null>(null);
  const onPhResizeStart = (phaseKey: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const s = st.getState();
    phResizeRef.current = { pid: phaseKey, startX: e.clientX, startW: getPW(s.phasePW, phaseKey) };
    const move = (ev: PointerEvent) => {
      const r = phResizeRef.current;
      if (!r) return;
      const cur = st.getState();
      const dx = (ev.clientX - r.startX) / cur.z;
      const blocks = allBlocks();
      const next = resizePhase(blocks, phases, cur.phasePW, r.pid, r.startW + dx);
      cur.setPhasePW(next);
    };
    const up = () => {
      phResizeRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      st.getState().bumpBlocks();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ── pin 클릭 → 연결 시작/취소 ── */
  const onPinClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = st.getState();
    s.setLink(s.link === id ? null : id);
  };

  /* ── 툴박스 액션 ── */
  const handleToggleEdit = () => {
    const s = st.getState();
    if (!s.edit) {
      s.enterEdit();
      return;
    }
    // 산출물의 Phase 메타데이터 확정 — 좌표는 건드리지 않는다(겹침 허용, 위 주석 참고).
    // origin==='incoming' 노드는 위치가 이 캔버스 소유가 아니므로 재배정 대상에서 뺀다.
    const { reassigned } = resolveNodePhases(s.nodes.filter((n) => n.origin !== 'incoming'), phases, s.phasePW);
    if (reassigned) s.bumpBlocks();
    // 저장이 끝난 뒤에야 edit을 끈다 — 그 전에 끄면 disabled 쿼리가 재활성화되며
    // 아직 반영 안 된 서버 데이터로 로컬 편집 결과를 덮어써 버릴 수 있다.
    onSaveLayout(() => st.getState().exitEdit());
  };
  const handleCancel = () => {
    st.getState().cancelEdit();
    toast('Changes cancelled');
  };
  const handleAutoFit = () => {
    const s = st.getState();
    const { positions, phasePW: nextPW } = computeAutoFit(s.nodes, s.edges, phases);
    s.nodes.forEach((n) => {
      const p = positions[n.id];
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    });
    s.setPhasePW(nextPW);
    toast('Re-laid out');
  };
  const handleAddNote = () => {
    const s = st.getState();
    const g = lanes[phases[0].key] ?? { x: 0 };
    const id = `tmp-note-${Date.now()}`;
    s.setMemos([
      ...s.memos,
      {
        id,
        ip: ip.id,
        phase: phases[0].key,
        text: 'New memo',
        x: snp(g.x + 46),
        y: 40 + 3 * 150,
        w: 160,
        h: 68,
      },
    ]);
    s.setFocusReq(id);
    toast('Memo added');
  };

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) elRefs.current.set(id, el);
    else elRefs.current.delete(id);
  }, []);

  const flashBnd = useCanvasStore((s) => s.flashBnd);

  return (
    <>
      <PhaseStepper
        phases={phases}
        phasePW={phasePW}
        nodes={nodes}
        z={z}
        panX={panX}
        edit={edit}
        onPhaseClick={(k) => st.getState().setPhInfo(k)}
        onResizeStart={onPhResizeStart}
      />

      <Box
        ref={vpRef}
        onPointerDown={onVpPointerDown}
        onPointerMove={onVpPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClick={onVpClick}
        sx={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: T.sf,
          ...(edit ? { outline: `2px solid ${T.tl3}`, outlineOffset: '-2px' } : {}),
        }}
      >
        <Box
          ref={cvRef}
          sx={{
            position: 'relative',
            width: W,
            height: H,
            transformOrigin: '0 0',
            willChange: 'transform',
            transform: `translate(${panX}px, ${panY}px) scale(${z})`,
            background: T.sf,
            ...(edit
              ? {
                  backgroundImage: `radial-gradient(circle,${T.ln} 1px,transparent 1px)`,
                  backgroundSize: '20px 20px',
                }
              : {}),
          }}
        >
          {/* Phase 레인 — 경계선은 canvas 밖 screen-space에서 그린다 */}
          {phases.map((p) => {
            const g = lanes[p.key];
            return (
              <Box
                key={p.key}
                data-lane={p.key}
                sx={{
                  position: 'absolute', top: 0, bottom: 0, left: g.x, width: g.w,
                  pointerEvents: 'none',
                }}
              >
                <Box component="span" sx={{ position: 'absolute', bottom: 10, left: 10, fontSize: 10, color: T.ln3 }}>
                  {p.label}
                </Box>
                {edit && (
                  <Box
                    onPointerDown={(e) => onPhResizeStart(p.key, e)}
                    sx={{
                      position: 'absolute', right: -5, top: 0, bottom: 0, width: 10,
                      cursor: 'col-resize', zIndex: 6, pointerEvents: 'all',
                      '&:hover': { background: 'rgba(12,154,131,.15)' },
                    }}
                  />
                )}
              </Box>
            );
          })}

          {/* today 세로선 — 블록 뒤에 깔림 */}
          {/* today 세로선은 screen-space overlay로 이전 — canvas scale 영향 없음 */}

          <EdgeLayer
            nodes={nodes}
            edges={edges}
            width={W}
            height={H}
            edit={edit}
            canEdit={canEdit}
            hlSet={hlSet}
            link={link}
            linkPos={linkPos}
            onDeleteEdge={(id) => {
              const s = st.getState();
              s.setEdges(s.edges.filter((x) => x.id !== id));
              toast('Link removed');
            }}
          />

          {/* 메모는 편집 권한자에게만 (설계서 6.3) */}
          {memos.map((n) => (
            <MemoBlock
              key={n.id}
              n={n}
              edit={edit}
              isSel={sel === n.id}
              onHl={!!hlSet && hlSet.has(n.id)}
              hasHl={!!hlSet}
              onGripDown={onGripDown}
              registerRef={registerRef}
              onPointerDown={onBlockPointerDown(n.id)}
              onPointerMove={onBlockPointerMove(n.id)}
              onPointerUp={onBlockPointerUp(n.id)}
            />
          ))}

          {nodes.map((d) => (
            <DeliverableNode
              key={d.id}
              d={d}
              phase={phases.find((p) => p.key === d.phase)}
              recvIp={d.recvIpId ? ipById.get(d.recvIpId) : undefined}
              edit={edit}
              canEdit={canEdit}
              isSel={sel === d.id}
              onHl={!!hlSet && hlSet.has(d.id)}
              hasHl={!!hlSet}
              dimLink={!!link && link !== d.id}
              linkActive={link === d.id}
              onOpen={(id) => (d.origin === 'incoming' ? onOpenIncoming(id) : st.getState().openDeliverable(id))}
              onPinClick={onPinClick}
              onGripDown={onGripDown}
              registerRef={registerRef}
              onPointerDown={onBlockPointerDown(d.id)}
              onPointerMove={onBlockPointerMove(d.id)}
              onPointerUp={onBlockPointerUp(d.id)}
              onClick={onBlockClick(d.id)}
            />
          ))}
        </Box>

        {/* Today 세로선 — canvas scale() 밖에서 고정 1.5px 폭으로 렌더 */}
        {!edit && tx !== null && (
          <Box sx={{
            position: 'absolute', top: 0, bottom: 0,
            left: Math.round(tx * z + panX), width: '1.5px',
            background: T.rd, opacity: 0.55,
            pointerEvents: 'none', zIndex: 1,
          }} />
        )}

        {/* Phase 경계 점선 — canvas scale() 밖에 렌더하므로 zoom에 관계없이
            dash 패턴이 항상 동일한 픽셀 크기를 유지한다. */}
        {phases.map((p) => {
          const g = lanes[p.key];
          const lineX = Math.round((g.x + g.w) * z + panX);
          const isFlash = flashBnd !== null && Math.abs(g.x + g.w - flashBnd) < 4;
          const col = isFlash ? T.tl : T.ln2;
          return (
            <Box
              key={`ph-line-${p.key}`}
              sx={{
                position: 'absolute', top: 0, bottom: 0,
                left: lineX, width: 2,
                backgroundImage: `repeating-linear-gradient(to bottom, ${col} 0, ${col} 5px, transparent 5px, transparent 10px)`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          );
        })}

        {/* Phase 레인 타이틀 — canvas scale() 밖 screen-space에 렌더해서 줌아웃해도 항상
            같은 픽셀 크기·대비를 유지한다 (Today 선 / Phase 경계 점선과 같은 방식). 세로 위치는
            의도적으로 뷰포트 상단에 고정 — 레인을 오래 내려다봐도 이름표가 항상 보인다. */}
        {phases.map((p) => {
          const g = lanes[p.key];
          const left = Math.round(g.x * z + panX);
          return (
            <Box
              key={`ph-label-${p.key}`}
              sx={{
                position: 'absolute', top: 10, left: left + 10,
                display: 'inline-flex', alignItems: 'center',
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '.09em',
                color: T.tx, background: T.sf, border: `1px solid ${T.ln2}`,
                borderRadius: '5px', padding: '3px 8px', boxShadow: T.ss,
                pointerEvents: 'none', zIndex: 2, whiteSpace: 'nowrap',
              }}
            >
              {p.key}
            </Box>
          );
        })}

        <Legend />
        <Toolbox
          canEdit={canEdit}
          edit={edit}
          onToggleEdit={handleToggleEdit}
          onCancel={handleCancel}
          onAdd={() => st.getState().setAddDlg(true)}
          onNote={handleAddNote}
          onAutoFit={handleAutoFit}
        />
      </Box>
    </>
  );
}
