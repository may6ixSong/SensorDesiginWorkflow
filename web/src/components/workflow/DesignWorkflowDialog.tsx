import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { DeliverableDto, DeliverablesListResponse, EdgeDto, Milestone, WorkflowDto } from '@/types/domain';
import { DocIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import { buildDomainModel, withAlpha, lighten, darken, DomainWorkflowModel, UNASSIGNED_DOMAIN } from '@/lib/domainWorkflow';
import { useThemeMode } from '@/theme/ThemeModeContext';
import {
  buildWorldLayout, connectedDeliverables, BlockNode, DomainZoneLayout, WorldLayout,
  BLOCK_LABEL_W, DOMAIN_HEAD_H, LABEL_W, UNSCHEDULED_W,
} from '@/lib/designWorkflowLayout';
import { SpaceBackdrop, SpacePalette, useSpacePalette } from './spaceBackdrop';

/* ──────────────────────────────────────────────────────────────────────────
 * Design Workflow — 과제 전체를 하나의 3D 우주로 펼쳐 보는 뷰.
 *
 * 축의 의미가 고정돼 있다(사용자 요청):
 *   x = 시간(날짜). 산출물은 자기 phase의 종료일 위치에 놓인다. 도메인이 달라도,
 *       workflow마다 일정이 달라도 같은 날짜면 같은 x다.
 *   y = workflow 한 줄. 도메인끼리는 큰 간격으로 떨어진다.
 *   z = 자유. 깊이는 결정적 해시로 흩뿌리며 아무 데이터도 뜻하지 않는다 — 산출물이
 *       표의 셀이 아니라 "우주에 떠 있는 행성"으로 보이게 하는 축이다.
 *
 * 중요한 원칙: 아무것도 가두지 않는다. 도메인도, 마일스톤도 사각형 판/카드/테두리로
 * 감싸지 않는다 — 도메인은 옅은 가로 대시 문턱 하나로만 구분되고, 과제 마일스톤은
 * x축 전체를 세로로 가로지르는 아주 옅은 밴드로만 깔린다.
 *
 * 3D는 CSS perspective로 만든다: 뷰포트에 perspective를, 카메라 레이어에
 * transform-style: preserve-3d를 걸고 각 산출물이 translate3d(x, y, z)로 놓인다.
 * ★ 그래서 중간 래퍼에 opacity/filter를 걸면 안 된다 — 그 순간 3D가 평면으로 눌린다.
 *   흐림 처리는 전부 잎(leaf) 요소에 직접 준다.
 *
 * 조작은 workflow 캔버스와 동일하다 — 휠=줌(커서 기준), 드래그=시점 이동. 좌측
 * 메뉴에서 도메인을 고르면 카메라가 그 구역까지 부드럽게 날아간다.
 * ────────────────────────────────────────────────────────────────────────── */

const NAV_W = 224;
const TOPBAR_H = 60;
const Z_MIN = 0.08;
const Z_MAX = 1.9;
/** CSS perspective 거리(px) — 클수록 원근이 약해진다. */
const PERSPECTIVE = 1600;

const STATUS_COLOR = {
  released: T.tl,
  inProgress: T.am,
  notSubmitted: T.dm2,
} as const;

/**
 * 산출물 구체를 음영 처리하려면 lighten()/darken()에 넘길 "진짜 hex"가 필요하다 —
 * T.tl 등은 CSS 변수 문자열이라 색상 연산이 안 된다.
 *
 * 다크 테마의 released/inProgress는 앱 전역 토큰(형광 teal·amber) 그대로 쓰면 구체
 * 특유의 하이라이트+발광이 겹쳐 눈이 부시다 — 이 화면 전용으로만 살짝 눌러 쓴다.
 */
const STATUS_HEX: Record<'light' | 'dark', Record<'released' | 'inProgress' | 'notSubmitted', string>> = {
  light: { released: '#2f6b4a', inProgress: '#ac6f08', notSubmitted: '#8b99ab' },
  dark: {
    released: darken('#6bc79a', 0.22),
    inProgress: darken('#f0b84e', 0.22),
    notSubmitted: darken('#6b7891', 0.1),
  },
};
/** 일정을 잃은 산출물의 색 — 상태와 무관하게 이 색으로 덮어써서 즉시 눈에 띄게 한다. */
const ORPHAN_HEX = { light: '#c8352c', dark: '#c9564e' };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** easeInOutCubic — 카메라 비행의 시작·끝을 눌러 주는 이징. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

interface Camera { x: number; y: number; z: number }

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectCode: string;
  /** 과제 공통 일정 — x축 배경 밴드이자 날짜축 범위의 일부다. */
  milestones: Milestone[];
  workflows: WorkflowDto[];
  /** 과제에 등록된 부서 목록(Project.departments) — 도메인 모델을 만들 때 빈 부서도 알아보기 위해 쓴다. */
  departments: string[];
}

export function DesignWorkflowDialog(props: Props) {
  const pal = useSpacePalette();
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullScreen
      PaperProps={{ sx: { background: pal.wash, overflow: 'hidden' } }}
    >
      <style>{`
        @keyframes dw-twinkle { 0%,100% { opacity:.3 } 50% { opacity:1 } }
        @keyframes dw-rise { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
        @media (prefers-reduced-motion: reduce) {
          .dw-twinkle { animation: none !important; }
        }
      `}</style>
      {props.open && <WorkflowStage {...props} />}
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════ Stage ═══ */

function WorkflowStage({
  onClose, projectId, projectName, projectCode, milestones, workflows, departments,
}: Props) {
  const navigate = useNavigate();
  const pal = useSpacePalette();
  const { mode } = useThemeMode();
  const statusHex = STATUS_HEX[mode];
  const orphanHex = ORPHAN_HEX[mode];
  const vpRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 0.4 });
  const camRef = useRef(cam);
  camRef.current = cam;
  /** 좌측 메뉴 강조용 — 카메라가 어느 구역 위에 있는지(근접도)로 자동 갱신된다. */
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  /**
   * 다른 구역을 흐리게 할지 — 메뉴에서 "명시적으로 고른" 경우에만 켠다.
   * 근접도(activeDomain)로 흐리게 하면 전체 보기에서도 가운데 구역만 남고 나머지가
   * 흐려져 버린다(전체를 보라고 만든 화면인데 정작 전체가 안 보인다).
   */
  const [focusedDomain, setFocusedDomain] = useState<string | null>(null);
  /** 클릭한 산출물 — 같은 workflow 안에서 flow로 연결된 것들만 하이라이트한다. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fittedRef = useRef(false);

  /* 모든 workflow의 산출물 — 캐시 키가 보드와 같아 이미 열어본 workflow는 즉시 뜬다. */
  const results = useQueries({
    queries: workflows.map((w) => ({
      queryKey: queryKeys.deliverables(w.id),
      staleTime: 15_000,
      queryFn: async () => {
        const res = await apiClient.get<DeliverablesListResponse>(`/workflows/${w.id}/deliverables`);
        return res.data;
      },
    })),
  });
  const sig = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|');
  const { byWorkflow, loading } = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    let anyLoading = false;
    workflows.forEach((w, i) => {
      const data = results[i]?.data;
      m.set(w.id, data?.data ?? []);
      if (!data) anyLoading = true;
    });
    return { byWorkflow: m, loading: anyLoading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows, sig]);

  /* 같은 workflow 안의 산출물↔산출물 flow(EdgeDto) — 보드와 같은 쿼리 키를 써서 캐시를 공유한다. */
  const edgeResults = useQueries({
    queries: workflows.map((w) => ({
      queryKey: queryKeys.edges(w.id),
      staleTime: 15_000,
      queryFn: async () => {
        const res = await apiClient.get<ApiEnvelope<EdgeDto[]>>(`/workflows/${w.id}/edges`);
        return res.data.data;
      },
    })),
  });
  const edgeSig = edgeResults.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|');
  const edgesByWorkflow = useMemo(() => {
    const m = new Map<string, EdgeDto[]>();
    workflows.forEach((w, i) => m.set(w.id, edgeResults[i]?.data ?? []));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows, edgeSig]);

  /** 산출물 id → 소유 workflow id — 클릭한 산출물이 어느 edge 그래프를 타야 하는지 찾는 용도. */
  const deliverableOwner = useMemo(() => {
    const m = new Map<string, string>();
    byWorkflow.forEach((items, wid) => items.forEach((d) => m.set(d.id, wid)));
    return m;
  }, [byWorkflow]);

  const domainSig = departments.join('|');
  const model: DomainWorkflowModel = useMemo(
    () => buildDomainModel(workflows, byWorkflow, departments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflows, byWorkflow, domainSig],
  );
  /** workflow가 하나도 없는 도메인은 이 화면에서 아예 존재하지 않는 것처럼 다룬다. */
  const nonEmptyDomains = useMemo(
    () => model.domains.filter((d) => d.workflows.length > 0),
    [model.domains],
  );
  const world: WorldLayout = useMemo(
    () => buildWorldLayout(nonEmptyDomains, milestones, byWorkflow, edgesByWorkflow),
    [nonEmptyDomains, milestones, byWorkflow, edgesByWorkflow],
  );
  const totalWires = useMemo(
    () => world.zones.reduce((n, z) => n + z.wires.length, 0),
    [world],
  );
  const totalOrphans = useMemo(
    () => world.zones.reduce((n, z) => n + z.rows.reduce((k, r) => k + r.orphans, 0), 0),
    [world],
  );

  const hlOwner = selectedId ? deliverableOwner.get(selectedId) ?? null : null;
  const hlSet = useMemo(() => {
    if (!selectedId || !hlOwner) return null;
    return connectedDeliverables(selectedId, edgesByWorkflow.get(hlOwner) ?? []);
  }, [selectedId, hlOwner, edgesByWorkflow]);

  const onSelectBlock = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  /* ── 뷰포트 크기 ── */
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.max(240, width), h: Math.max(240, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 카메라 비행 — 좌측 메뉴에서 도메인을 고를 때의 "부드러운 이동"이 여기다. ── */
  const flightRef = useRef<number | null>(null);
  const flyTo = useCallback((target: Camera, ms?: number) => {
    if (flightRef.current !== null) cancelAnimationFrame(flightRef.current);
    const from = camRef.current;
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    // 멀수록 오래 — "구역과 구역 사이를 가로질러 간다"는 느낌이 나게.
    const dur = ms ?? clamp(520 + dist * 0.28, 520, 1500);
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = easeInOutCubic(p);
      setCam({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        z: from.z + (target.z - from.z) * e,
      });
      flightRef.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    flightRef.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => { if (flightRef.current !== null) cancelAnimationFrame(flightRef.current); }, []);

  /** 월드 사각형이 화면에 꽉 차도록 카메라를 계산한다. */
  const frameRect = useCallback(
    (r: { x: number; y: number; w: number; h: number }, pad = 1.12): Camera => {
      const z = clamp(Math.min(size.w / (r.w * pad), size.h / (r.h * pad)), Z_MIN, Z_MAX);
      return { z, x: size.w / 2 - (r.x + r.w / 2) * z, y: size.h / 2 - (r.y + r.h / 2) * z };
    },
    [size.w, size.h],
  );

  /**
   * 세로로만 꽉 채우는 카메라 계산 — 도메인 전체를 fit하면 가로(전체 날짜축)에 밀려
   * 세로가 화면을 못 채운다. 그래서 세로만 그 도메인 높이에 맞추고, 가로는 라벨과
   * 축 시작 지점이 보이는 왼쪽에 둔다.
   */
  const frameZoneHeight = useCallback(
    (zone: DomainZoneLayout, pad = 1.1): Camera => {
      const z = clamp(size.h / (zone.h * pad), Z_MIN, Z_MAX);
      const y = size.h / 2 - (zone.y + zone.h / 2) * z;
      const x = 32 - world.bounds.x * z;
      return { z, x, y };
    },
    [size.h, world.bounds.x],
  );

  /*
   * 처음 열렸을 때(그리고 데이터가 들어와 크기가 확정될 때) — 전체 도메인을 다 보여주면
   * 도메인이 많고 날짜축이 넓을수록 하나하나가 너무 작아진다. 그래서 첫 도메인(가장
   * workflow가 많은 도메인) 하나가 화면을 세로로 꽉 채우도록 시작한다. 전체를 보려면
   * "Show all domains" 버튼으로 언제든 fitAll할 수 있다.
   */
  useEffect(() => {
    if (fittedRef.current || !world.zones.length) return;
    if (size.w <= 240) return;
    fittedRef.current = true;
    setCam(frameZoneHeight(world.zones[0]));
  }, [world, size.w, frameZoneHeight]);

  const fitAll = useCallback(() => {
    setFocusedDomain(null);
    flyTo(frameRect(world.bounds, 1.16));
  }, [flyTo, frameRect, world.bounds]);

  const focusZone = useCallback((zone: DomainZoneLayout) => {
    setFocusedDomain(zone.key);
    flyTo(frameRect({ x: world.bounds.x, y: zone.y, w: world.bounds.w, h: zone.h }, 1.08));
  }, [flyTo, frameRect, world.bounds]);

  const zoomBy = useCallback((factor: number) => {
    const c = camRef.current;
    const z = clamp(c.z * factor, Z_MIN, Z_MAX);
    const cx = size.w / 2;
    const cy = size.h / 2;
    flyTo({ z, x: cx - (cx - c.x) * (z / c.z), y: cy - (cy - c.y) * (z / c.z) }, 240);
  }, [flyTo, size.w, size.h]);

  /* ── 휠 = 줌(커서 기준). passive:false가 필요해 직접 등록한다. ── */
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (flightRef.current !== null) { cancelAnimationFrame(flightRef.current); flightRef.current = null; }
      setFocusedDomain(null);
      const r = vp.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setCam((c) => {
        const z = clamp(c.z * Math.exp(-e.deltaY * 0.0015), Z_MIN, Z_MAX);
        const k = z / c.z;
        return { z, x: mx - (mx - c.x) * k, y: my - (my - c.y) * k };
      });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  /* ── 드래그 = 시점 이동 ──
   * setPointerCapture는 쓰지 않는다 — 캡처를 걸면 이후 click의 타깃까지 뷰포트로
   * 바뀌어 안쪽 블록/버튼의 onClick이 죽는다. 대신 드래그 중에만 window에 리스너를
   * 달고, 4px 넘게 움직였으면 뒤따르는 click을 무시한다. */
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const movedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (flightRef.current !== null) { cancelAnimationFrame(flightRef.current); flightRef.current = null; }
    dragRef.current = { px: e.clientX, py: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
    movedRef.current = false;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (Math.hypot(dx, dy) > 4) { movedRef.current = true; setFocusedDomain(null); }
      setCam((c) => ({ ...c, x: d.cx + dx, y: d.cy + dy }));
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  /** 드래그 끝에 딸려 오는 click은 선택으로 치지 않는다. */
  const openWorkflow = useCallback((id: string) => {
    if (movedRef.current) return;
    onClose();
    navigate(`/details/${projectId}/${id}`);
  }, [navigate, onClose, projectId]);

  const onViewportClick = useCallback(() => {
    if (movedRef.current) return;
    setSelectedId(null);
  }, []);

  /* 카메라가 어느 구역 위에 있는지 → 좌측 메뉴 강조. */
  useEffect(() => {
    if (!world.zones.length) return;
    const midY = (size.h / 2 - cam.y) / cam.z;
    let best: string | null = null;
    let bestDist = Infinity;
    world.zones.forEach((z) => {
      const c = z.y + z.h / 2;
      const d = Math.abs(c - midY);
      if (d < bestDist) { bestDist = d; best = z.key; }
    });
    setActiveDomain(best);
  }, [cam, world.zones, size.h]);

  /**
   * 줌이 낮으면 블록 글자가 어차피 안 읽히므로 접는다(LOD). fit-all 상태에서도
   * "이게 뭔지"는 보여야 하므로 예전보다 낮은 줌에서도 계속 켜져 있게 문턱을 낮췄다.
   */
  const detail = cam.z > 0.16;
  const worldBottom = world.bounds.y + world.bounds.h;

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        projectName={projectName}
        projectCode={projectCode}
        model={model}
        domainCount={world.zones.length}
        totalWires={totalWires}
        totalOrphans={totalOrphans}
        loading={loading}
        zoom={cam.z}
        pal={pal}
        onZoomIn={() => zoomBy(1.4)}
        onZoomOut={() => zoomBy(1 / 1.4)}
        onFit={fitAll}
        onClose={onClose}
      />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <DomainNav
          zones={world.zones}
          active={activeDomain}
          pal={pal}
          onPick={focusZone}
          onAll={fitAll}
        />

        {/* ── 뷰포트: 스크롤 없음, 카메라만. perspective가 여기 걸린다. ── */}
        <Box
          ref={vpRef}
          onPointerDown={onPointerDown}
          onClick={onViewportClick}
          sx={{
            position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
            perspective: `${PERSPECTIVE}px`,
            perspectiveOrigin: '50% 50%',
          }}
        >
          <SpaceBackdrop camX={cam.x} camY={cam.y} camZ={cam.z} />

          {/*
           * 카메라 레이어 — 여기부터 아래로는 opacity/filter를 걸면 3D가 평면으로 눌린다.
           *
           * pointerEvents: 'none'이 핵심이다 — preserve-3d 안에서는 z가 다른 자손들이
           * 실제 깊이 순으로 히트테스트된다. 이 레이어 자체는 z=0 평면에 background 없이
           * 걸쳐 있을 뿐인데, pointerEvents를 안 끄면 카메라보다 더 안쪽(z<0)으로 밀려난
           * 구체 위에서 클릭이 이 투명한 평면에 먼저 잡혀버려 씹힌다(산출물의 대략 절반이
           * Z_SPREAD 때문에 음수 z를 갖는다 — 그만큼의 산출물이 클릭 불가 상태였다).
           * 실제 클릭을 받는 버튼(구체, workflow 라벨)은 전부 pointerEvents: 'auto'를
           * 직접 켜 두므로, 여기서 끄더라도 그 자손들까지 막히지는 않는다.
           */}
          <Box
            sx={{
              position: 'absolute', inset: 0, transformOrigin: '0 0', willChange: 'transform',
              transformStyle: 'preserve-3d', pointerEvents: 'none',
            }}
            style={{ transform: `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.z})` }}
          >
            <TimeAxis world={world} top={world.bounds.y} bottom={worldBottom} detail={detail} />

            {world.zones.map((zone) => {
              const isOwnerZone = hlSet ? zone.rows.some((r) => r.workflow.id === hlOwner) : false;
              const dim = hlSet
                ? (isOwnerZone ? 1 : 0.16)
                : (Boolean(focusedDomain) && focusedDomain !== zone.key ? 0.36 : 1);
              return (
                <DomainZone
                  key={zone.key}
                  zone={zone}
                  world={world}
                  statusHex={statusHex}
                  orphanHex={orphanHex}
                  detail={detail}
                  dim={dim}
                  hlSet={hlSet}
                  hlOwner={hlOwner}
                  onOpenWorkflow={openWorkflow}
                  onSelectBlock={onSelectBlock}
                />
              );
            })}
          </Box>

          {!world.zones.length && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <Box sx={{ textAlign: 'center', color: T.dm2, fontSize: 13 }}>
                이 과제에서 볼 수 있는 workflow가 없습니다.
              </Box>
            </Box>
          )}

          <HintBar pal={pal} />
        </Box>
      </Box>
    </Box>
  );
}

/* ══════════════════════════════════════════════════════════════ TimeAxis ═══ */

/**
 * 시간축 배경 — 월드 전체를 세로로 가로지른다.
 *   · 과제 마일스톤 = 아주 옅은 세로 밴드 + 위쪽 라벨. 도메인/workflow와 무관하게
 *     화면 전체에 걸리는 배경이며, 무언가를 감싸는 프레임이 아니다.
 *   · 월 눈금과 TODAY 선.
 *   · 왼쪽 바깥의 "일정 없음" 구역 표시 — 유실된 산출물이 모이는 자리다.
 * 전부 z=0 평면에 있다.
 */
function TimeAxis({
  world, top, bottom, detail,
}: {
  world: WorldLayout; top: number; bottom: number; detail: boolean;
}) {
  const h = bottom - top;
  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {world.bands.map((b) => {
        const cur = b.state === 'current';
        return (
          <Box key={b.id}>
            <Box
              style={{ left: b.x, top, width: b.w, height: h }}
              sx={{
                position: 'absolute',
                background: cur ? withAlpha('#6bc79a', 0.05) : withAlpha('#8b99ab', 0.028),
                borderLeft: `1px ${cur ? 'solid' : 'dashed'} ${withAlpha(cur ? '#6bc79a' : '#8b99ab', cur ? 0.4 : 0.18)}`,
              }}
            />
            <Halo
              style={{ left: b.x + 8, top: top + 10 }}
              sx={{
                position: 'absolute', display: 'flex', alignItems: 'center', gap: '6px',
                fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, letterSpacing: '.08em',
                color: cur ? T.tl : T.dm, whiteSpace: 'nowrap',
              }}
            >
              {b.name}
              {cur && (
                <Box
                  component="span"
                  sx={{
                    fontSize: 9, fontFamily: FONT_MONO, color: '#fff', background: T.tl,
                    borderRadius: '999px', padding: '1px 6px', fontWeight: 700,
                  }}
                >
                  NOW
                </Box>
              )}
            </Halo>
          </Box>
        );
      })}

      {detail && world.ticks.map((t) => (
        <Halo
          key={t.label}
          style={{ left: t.x + 4, top: bottom + 12 }}
          sx={{ position: 'absolute', fontFamily: FONT_MONO, fontSize: 12, color: T.dm2, whiteSpace: 'nowrap' }}
        >
          {t.label}
        </Halo>
      ))}

      {world.todayX !== null && (
        <>
          <Box
            style={{ left: world.todayX, top, height: h }}
            sx={{ position: 'absolute', width: '2px', background: withAlpha('#ff6b62', 0.5) }}
          />
          <Halo
            style={{ left: world.todayX + 7, top: top + 34 }}
            sx={{ position: 'absolute', fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: T.rd, whiteSpace: 'nowrap' }}
          >
            TODAY
          </Halo>
        </>
      )}

      {/* "일정 없음" 구역 — 날짜축 바깥이라는 사실 자체가 표시다. */}
      <Box
        style={{ left: LABEL_W, top, width: UNSCHEDULED_W, height: h }}
        sx={{
          position: 'absolute',
          background: `repeating-linear-gradient(135deg, ${withAlpha('#c8352c', 0.05)} 0 10px, transparent 10px 20px)`,
          borderRight: `1px dashed ${withAlpha('#c8352c', 0.35)}`,
        }}
      />
      <Halo
        style={{ left: LABEL_W + 10, top: top + 10 }}
        sx={{
          position: 'absolute', fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700,
          letterSpacing: '.08em', color: T.rd, whiteSpace: 'nowrap', lineHeight: 1.5,
        }}
      >
        NO SCHEDULE
      </Halo>
    </Box>
  );
}

/* ══════════════════════════════════════════════════════════ DomainZone ═══ */

/**
 * 도메인 하나의 구역. 판도, 카드도, 테두리도 없다 — 시작점에 아주 옅은 가로 대시
 * 라인 + 라벨만 띄운다. 그 선은 "그 너머에 다른 도메인이 있다"는 문턱일 뿐이다.
 *
 * ★ 이 컴포넌트와 그 자식에는 opacity를 걸지 않는다(3D 평면화 방지) — dim은 잎
 *   요소마다 직접 곱해서 넘긴다.
 */
function DomainZone({
  zone, world, statusHex, orphanHex, detail, dim, hlSet, hlOwner, onOpenWorkflow, onSelectBlock,
}: {
  zone: DomainZoneLayout;
  world: WorldLayout;
  statusHex: Record<'released' | 'inProgress' | 'notSubmitted', string>;
  orphanHex: string;
  detail: boolean;
  dim: number;
  hlSet: Set<string> | null;
  hlOwner: string | null;
  onOpenWorkflow: (id: string) => void;
  onSelectBlock: (id: string) => void;
}) {
  const label = zone.key === UNASSIGNED_DOMAIN ? 'Unassigned' : zone.label;
  const lineW = world.bounds.w;
  const hlColor = hlOwner ? (zone.rows.find((r) => r.workflow.id === hlOwner)?.workflow.color ?? T.tl) : null;

  return (
    <Box sx={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
      {/* 도메인 문턱 — 가로 대시 한 줄. 왼쪽·오른쪽·아래에는 선이 없다. */}
      <Box
        style={{ left: 0, top: zone.y + DOMAIN_HEAD_H - 26, width: lineW, opacity: dim }}
        sx={{ position: 'absolute', height: 0, borderTop: `1px dashed ${withAlpha(zone.color, 0.34)}` }}
      />
      <Box
        style={{ left: 18, top: zone.y + DOMAIN_HEAD_H - 62, opacity: dim }}
        sx={{ position: 'absolute', display: 'flex', alignItems: 'baseline', gap: '13px' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: zone.color, boxShadow: `0 0 12px ${withAlpha(zone.color, 0.85)}` }} />
          <Halo sx={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, letterSpacing: '.12em', color: T.tx }}>
            {label}
          </Halo>
        </Box>
        <Halo sx={{ fontSize: 12.5, color: T.dm2, fontFamily: FONT_MONO }}>
          {zone.rows.length} workflow · {zone.released}/{zone.total} released
        </Halo>
      </Box>

      {/* 와이어 — 같은 workflow 안의 산출물↔산출물 flow만. 구체보다 먼저 그려서 뒤로 숨는다. */}
      {zone.wires.length > 0 && (
        <Box
          component="svg"
          style={{ left: 0, top: 0, width: world.bounds.x + world.bounds.w, height: zone.y + zone.h }}
          sx={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}
        >
          {zone.wires.map((w) => {
            const on = !!hlSet && hlSet.has(w.fromId) && hlSet.has(w.toId);
            return (
              <g key={w.id} opacity={(hlSet ? (on ? 1 : 0.06) : 1) * dim} style={{ transition: 'opacity .3s' }}>
                <path d={w.path} fill="none" stroke={on ? hlColor ?? T.tl : T.dm2} strokeWidth={on ? 1.6 : 1} opacity={on ? 0.9 : 0.32} strokeLinecap="round" />
                {on && (
                  <path
                    d={w.path} fill="none" stroke={hlColor ?? T.tl} strokeWidth={2.2} strokeLinecap="round"
                    strokeDasharray="9 10" opacity={0.85} style={{ animation: 'flowdash .65s linear infinite' }}
                  />
                )}
              </g>
            );
          })}
        </Box>
      )}

      {/* workflow 행 — 박스 없이 점 + 이름만 떠 있는 라벨 + 그 줄의 산출물 구체들. */}
      {zone.rows.map((row) => {
        const rowDim = dim * (hlSet ? (row.workflow.id === hlOwner ? 1 : 0.28) : 1);
        return (
          <Box key={row.workflow.id} sx={{ transformStyle: 'preserve-3d' }}>
            <Box
              component="button"
              onClick={() => onOpenWorkflow(row.workflow.id)}
              title={`${row.workflow.name} — open workflow board`}
              style={{ left: 18, top: row.y - 20, width: LABEL_W - 34, opacity: rowDim }}
              sx={{
                position: 'absolute', display: 'flex', flexDirection: 'column', gap: '2px',
                alignItems: 'flex-start', textAlign: 'left', background: 'transparent', border: 'none',
                padding: 0, cursor: CURSOR_POINTER, fontFamily: 'inherit', color: 'inherit',
                pointerEvents: 'auto',
                '&:hover .dw-wf-name': { color: row.workflow.color || T.tl },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
                <Box
                  sx={{
                    width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                    background: row.workflow.color || T.tl,
                    boxShadow: `0 0 8px ${withAlpha(row.workflow.color || '#2f6b4a', 0.75)}`,
                  }}
                />
                <Halo
                  className="dw-wf-name"
                  sx={{
                    fontSize: 15, fontWeight: 700, color: T.tx, transition: 'color .15s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: LABEL_W - 60,
                  }}
                >
                  {row.workflow.name}
                </Halo>
              </Box>
              {detail && (
                <Halo sx={{ fontSize: 10.5, color: row.orphans ? T.rd : T.dm2, ml: '17px' }}>
                  {row.released}/{row.total} released
                  {row.orphans > 0 && ` · ${row.orphans} unscheduled`}
                </Halo>
              )}
            </Box>

            {row.blocks.map((b) => (
              <DeliverableBlock
                key={b.id}
                b={b}
                hex={b.orphan ? orphanHex : statusHex[b.status]}
                detail={detail}
                selected={!!hlSet && hlSet.has(b.id)}
                opacity={rowDim * (hlSet && !hlSet.has(b.id) ? 0.3 : 1)}
                onSelect={onSelectBlock}
              />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * 별이 흐린 배경 위에서도 박스 없이 읽히도록 대비를 살짝만 깔아 주는 래퍼.
 * 그림자는 딱 하나, 아주 작은 블러로 아래쪽에만 살짝 — 글자 두께에는 손대지 않는다.
 */
function Halo({ children, sx, style, className }: { children: React.ReactNode; sx?: object; style?: React.CSSProperties; className?: string }) {
  return (
    <Box
      className={className}
      style={style}
      sx={{
        textShadow: '0 1px 1.5px rgba(0,0,0,.55)',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * 산출물 = 카드가 아니라 실제로 광원이 있는 구체다. translate3d의 z가 깊이를 만들고,
 * 뷰포트의 perspective가 그 깊이를 원근으로 바꾼다 — 그래서 같은 x·y라도 z가 다르면
 * 화면상 위치와 크기가 달라져 "떠 있는 행성"처럼 보인다.
 *
 * 일정을 잃은 산출물은 상태색 대신 붉은색 + 파선 링을 둘러 즉시 구분되게 한다.
 */
function DeliverableBlock({
  b, hex, detail, selected, opacity, onSelect,
}: {
  b: BlockNode; hex: string; detail: boolean;
  selected: boolean; opacity: number; onSelect: (id: string) => void;
}) {
  /*
   * 원이 아니라 진짜 광원 받은 구체로 읽히려면 하이라이트 하나로는 부족하다 —
   * (1) 작고 날카로운 정반사 글린트, (2) 그보다 넓고 흐린 광택 스프레드,
   * (3) 중심에서 가장자리로 갈수록 어두워지는 vignette(구면이 시선에서 꺾여 나가는
   * 램버시안 감쇠를 흉내), (4) 빛의 반대편(터미네이터) core shadow까지 네 겹을 얹어야
   * "원"이 아니라 "구"의 명암비가 산다. blend mode로 겹쳐야 밑에 깔린 색상(hex)이
   * 흐려지지 않는다.
   */
  const sphereBg = [
    `radial-gradient(circle at 26% 21%, #ffffff 0%, ${withAlpha('#ffffff', 0.9)} 4%, ${withAlpha('#ffffff', 0)} 13%)`,
    `radial-gradient(circle at 30% 26%, ${withAlpha('#ffffff', 0.55)} 0%, ${withAlpha('#ffffff', 0)} 30%)`,
    `radial-gradient(circle at 50% 50%, ${withAlpha('#000000', 0)} 52%, ${withAlpha('#000000', 0.4)} 96%, ${withAlpha('#000000', 0.62)} 100%)`,
    `radial-gradient(circle at 70% 76%, ${withAlpha('#000000', 0.6)} 0%, ${withAlpha('#000000', 0)} 46%)`,
    `radial-gradient(circle at 38% 34%, ${lighten(hex, 0.55)} 0%, ${hex} 44%, ${darken(hex, 0.72)} 100%)`,
  ].join(',');
  const sphereBlend = 'screen, screen, multiply, multiply, normal';

  return (
    <Box
      component="button"
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); onSelect(b.id); }}
      style={{
        left: b.x - b.d / 2,
        top: b.y - b.d / 2,
        transform: `translate3d(0, 0, ${b.z}px)`,
        opacity,
      }}
      sx={{
        position: 'absolute', border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit',
        cursor: CURSOR_POINTER, transition: 'opacity .3s', pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap',
      }}
      title={`${b.name}\n${b.orphan ? 'No release schedule' : b.phaseName ?? ''}`}
    >
      <Box
        style={{ width: b.d, height: b.d }}
        sx={{
          position: 'relative', borderRadius: '50%', flex: '0 0 auto',
          background: sphereBg,
          backgroundBlendMode: sphereBlend,
          border: b.orphan ? `2px dashed ${withAlpha('#ffffff', 0.75)}` : 'none',
          // inset shadow = 구체 표면이 빛에서 멀어지는 쪽으로 꺾이는 곡률감(terminator).
          // 바깥 glow/contact shadow와 같이 있어야 "떠 있는 구"가 완성된다.
          boxShadow: selected
            ? `inset -${b.d * 0.16}px -${b.d * 0.18}px ${b.d * 0.3}px ${withAlpha('#000000', 0.4)}, 0 0 0 2.5px #fff, 0 0 ${b.d * 0.85}px ${withAlpha(hex, 0.75)}, 0 ${b.d * 0.18}px ${b.d * 0.3}px ${withAlpha('#000000', 0.4)}`
            : `inset -${b.d * 0.16}px -${b.d * 0.18}px ${b.d * 0.3}px ${withAlpha('#000000', 0.4)}, 0 0 ${b.d * 0.5}px ${withAlpha(hex, 0.42)}, 0 ${b.d * 0.18}px ${b.d * 0.3}px ${withAlpha('#000000', 0.4)}`,
          transition: 'box-shadow .2s',
        }}
      >
        {detail && (
          <Box
            sx={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              color: withAlpha('#ffffff', 0.92), filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
            }}
          >
            <DocIcon type={b.docType} size={Math.round(b.d * 0.42)} />
          </Box>
        )}
      </Box>

      {detail && (
        <Box
          sx={{
            fontSize: 16, fontWeight: 600, color: b.orphan ? T.rd : T.tx, textAlign: 'left',
            textShadow: `0 1px 3px ${withAlpha('#000000', 0.25)}`,
            maxWidth: BLOCK_LABEL_W, overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {b.name}
        </Box>
      )}
    </Box>
  );
}

/* ═════════════════════════════════════════════════════════════ Chrome ═══ */

function TopBar({
  projectName, projectCode, model, domainCount, totalWires, totalOrphans, loading, zoom, pal,
  onZoomIn, onZoomOut, onFit, onClose,
}: {
  projectName: string; projectCode: string; model: DomainWorkflowModel;
  domainCount: number; totalWires: number; totalOrphans: number; loading: boolean; zoom: number; pal: SpacePalette;
  onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onClose: () => void;
}) {
  return (
    <Box
      sx={{
        flex: `0 0 ${TOPBAR_H}px`, display: 'flex', alignItems: 'center', gap: '16px', zIndex: 2,
        padding: '0 16px', borderBottom: `1px solid ${pal.panelBorder}`,
        background: pal.panelBg, backdropFilter: 'blur(14px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Icon name="grid" size={17} />
        <Box>
          <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>
            Design Workflow
          </Box>
          <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>{projectCode} · {projectName}</Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1 }} />

      {loading && <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>loading…</Box>}

      <Box sx={{ display: 'flex', gap: '18px', mr: '4px' }}>
        <Stat label="DOMAINS" value={domainCount} />
        <Stat label="WORKFLOWS" value={model.domains.reduce((n, d) => n + d.workflows.length, 0)} />
        <Stat label="WIRES" value={totalWires} />
        {totalOrphans > 0 && <Stat label="UNSCHEDULED" value={totalOrphans} tone={T.rd} />}
        <Stat label="RELEASED" value={`${model.counts.released}/${model.counts.total}`} tone={T.tl} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <GlassBtn onClick={onZoomOut} title="Zoom out">−</GlassBtn>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, width: 38, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Box>
        <GlassBtn onClick={onZoomIn} title="Zoom in">+</GlassBtn>
        <GlassBtn onClick={onFit} title="Fit all domains"><Icon name="fit" size={13} /></GlassBtn>
        <GlassBtn onClick={onClose} title="Close"><Icon name="x" size={14} /></GlassBtn>
      </Box>
    </Box>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.14em', color: T.dm2 }}>{label}</Box>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: tone ?? T.tx }}>{value}</Box>
    </Box>
  );
}

function GlassBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <Box
      component="button"
      title={title}
      onClick={onClick}
      sx={{
        display: 'inline-grid', placeItems: 'center', minWidth: 30, height: 30, padding: '0 8px',
        borderRadius: '8px', border: `1px solid ${T.ln2}`, background: 'transparent',
        color: T.tx, fontSize: 15, fontFamily: 'inherit', cursor: CURSOR_POINTER,
        '&:hover': { background: T.sf3 },
      }}
    >
      {children}
    </Box>
  );
}

function DomainNav({
  zones, active, pal, onPick, onAll,
}: {
  zones: DomainZoneLayout[]; active: string | null; pal: SpacePalette;
  onPick: (zone: DomainZoneLayout) => void; onAll: () => void;
}) {
  return (
    <Box
      sx={{
        flex: `0 0 ${NAV_W}px`, zIndex: 2, borderRight: `1px solid ${pal.panelBorder}`,
        background: pal.panelBg, backdropFilter: 'blur(14px)',
        overflowY: 'auto', padding: '14px 10px',
      }}
    >
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.16em', color: T.dm2, px: '4px', mb: '8px' }}>
        DOMAINS
      </Box>

      <Box
        component="button"
        onClick={onAll}
        sx={{
          textAlign: 'left', width: '100%', border: `1px solid ${T.ln2}`, borderRadius: '9px',
          padding: '7px 10px', mb: '8px', cursor: CURSOR_POINTER, fontFamily: 'inherit',
          background: 'transparent', color: T.dm, fontSize: 11.5,
          display: 'flex', alignItems: 'center', gap: '7px',
          '&:hover': { background: T.sf3, color: T.tx },
        }}
      >
        <Icon name="fit" size={12} /> Show all domains
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {zones.map((z) => {
          const pct = z.total ? Math.round((z.released / z.total) * 100) : 0;
          const on = active === z.key;
          const label = z.key === UNASSIGNED_DOMAIN ? 'Unassigned' : z.key;
          const orphans = z.rows.reduce((n, r) => n + r.orphans, 0);
          return (
            <Box
              key={z.key}
              component="button"
              onClick={() => onPick(z)}
              sx={{
                textAlign: 'left', width: '100%', border: '1px solid', borderRadius: '9px',
                padding: '8px 10px', cursor: CURSOR_POINTER, fontFamily: 'inherit', transition: '.14s',
                borderColor: on ? withAlpha(z.color, 0.55) : 'transparent',
                background: on ? withAlpha(z.color, 0.12) : 'transparent',
                '&:hover': { background: on ? withAlpha(z.color, 0.16) : T.sf3 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: '50%', background: z.color, flex: '0 0 auto',
                    boxShadow: on ? `0 0 9px ${withAlpha(z.color, 0.9)}` : 'none',
                  }}
                />
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: on ? T.tx : T.dm,
                    letterSpacing: '.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
              </Box>
              <Box sx={{ fontSize: 9.5, color: T.dm2, mt: '3px', ml: '16px' }}>
                {z.rows.length} workflow · {z.released}/{z.total} released
                {orphans > 0 && <Box component="span" sx={{ color: T.rd }}> · {orphans} unscheduled</Box>}
              </Box>
              <Box sx={{ height: 3, borderRadius: 999, background: T.sf3, mt: '5px', ml: '16px', overflow: 'hidden' }}>
                <Box sx={{ width: `${pct}%`, height: '100%', background: z.color, transition: 'width .3s' }} />
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: '14px', pt: '10px', borderTop: `1px solid ${pal.panelBorder}`, display: 'flex', flexDirection: 'column', gap: '6px', px: '4px' }}>
        {(['released', 'inProgress', 'notSubmitted'] as const).map((k) => (
          <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 10.5, color: T.dm }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '3px', background: STATUS_COLOR[k] }} />
            {k === 'released' ? 'Released' : k === 'inProgress' ? 'In progress' : 'Not submitted'}
          </Box>
        ))}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 10.5, color: T.rd }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', border: `2px dashed ${T.rd}` }} />
          No release schedule
        </Box>
      </Box>
    </Box>
  );
}

function HintBar({ pal }: { pal: SpacePalette }) {
  return (
    <Box
      sx={{
        position: 'absolute', left: 14, bottom: 14, zIndex: 2, display: 'flex', gap: '14px',
        padding: '7px 13px', borderRadius: '999px', border: `1px solid ${pal.panelBorder}`,
        background: pal.panelBg, backdropFilter: 'blur(10px)', pointerEvents: 'none',
        fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO,
      }}
    >
      <span>DRAG · 시점 이동</span>
      <span>WHEEL · 확대/축소</span>
      <span>X · 시간 &nbsp;/&nbsp; Y · workflow</span>
    </Box>
  );
}
