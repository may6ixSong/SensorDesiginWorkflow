import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { DeliverableDto, DeliverablesListResponse, IpDto, PhaseRef } from '@/types/domain';
import { DocIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import { buildDomainModel, withAlpha, DomainWorkflowModel, UNASSIGNED_DOMAIN } from '@/lib/domainWorkflow';
import {
  buildWorldLayout, BlockNode, IslandLayout, WorldLayout,
  GUTTER_W, ISLAND_HEAD_H, ISLAND_PAD, LABEL_W, PHASE_HEAD_H,
} from '@/lib/designWorkflowLayout';
import { SpaceBackdrop, SpacePalette, useSpacePalette } from './spaceBackdrop';

/* ──────────────────────────────────────────────────────────────────────────
 * Design Workflow — 과제 전체를 우주에 떠 있는 "아주 큰 한 판"으로 펼쳐 보는 뷰.
 *
 *   Domain  = 우주에 둥둥 떠 있는 거대한 판(island). 살짝 기울어져(rotateX) 있고
 *             아래로 후광과 그림자가 깔려 공중에 뜬 것처럼 보인다.
 *   IP      = 그 판 위의 한 줄(row).
 *   산출물   = 판 위에 떠 있는 블록. 판보다 앞(translateZ)에 있고 미세하게 위아래로
 *             흔들려(bob) 정지 화면에서도 떠 있는 게 읽힌다.
 *   흐름     = 같은 도메인 안의 IP↔IP 산출물 핸드오프만 거터에 곡선으로.
 *
 * 조작은 IP 캔버스와 동일하다 — 휠=줌(커서 기준), 드래그=시점 이동. 스크롤바는 없다.
 * 좌측 메뉴에서 도메인을 고르면 카메라가 그 판까지 부드럽게 날아간다.
 * ────────────────────────────────────────────────────────────────────────── */

const NAV_W = 224;
const TOPBAR_H = 60;
const Z_MIN = 0.09;
const Z_MAX = 1.9;
/** 판이 기울어진 각도 — 크면 글자가 뭉개지므로 아주 얕게만. */
const TILT_DEG = 7;
/** 블록이 판 위로 떠오른 높이(px, 월드 기준). */
const BLOCK_LIFT = 26;

const STATUS_COLOR = {
  released: T.tl,
  inProgress: T.am,
  notSubmitted: T.dm2,
} as const;

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
  phases: PhaseRef[];
  ips: IpDto[];
  /** 과제에 등록된 도메인 목록 — IP가 아직 배정되지 않은 도메인도 빈 판으로 그린다. */
  ipDomains: string[];
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
        @keyframes dw-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
        @keyframes dw-rise { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
        @media (prefers-reduced-motion: reduce) {
          .dw-twinkle, .dw-bob { animation: none !important; }
        }
      `}</style>
      {props.open && <WorkflowStage {...props} />}
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════ Stage ═══ */

function WorkflowStage({
  onClose, projectId, projectName, projectCode, phases, ips, ipDomains,
}: Props) {
  const navigate = useNavigate();
  const pal = useSpacePalette();
  const vpRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, z: 0.4 });
  const camRef = useRef(cam);
  camRef.current = cam;
  /** 좌측 메뉴 강조용 — 카메라가 어느 판 위에 있는지(근접도)로 자동 갱신된다. */
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  /**
   * 다른 판을 흐리게 할지 — 메뉴에서 "명시적으로 고른" 경우에만 켠다.
   * 근접도(activeDomain)로 흐리게 하면 전체 보기에서도 가운데 판만 남고 나머지가
   * 흐려져 버린다(전체를 보라고 만든 화면인데 정작 전체가 안 보인다).
   */
  const [focusedDomain, setFocusedDomain] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fittedRef = useRef(false);

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);

  /* 모든 IP의 산출물 — 캐시 키가 IP 보드와 같아 이미 열어본 IP는 즉시 뜬다. */
  const results = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.deliverables(ip.id),
      staleTime: 15_000,
      queryFn: async () => {
        const res = await apiClient.get<DeliverablesListResponse>(`/ips/${ip.id}/deliverables`);
        return res.data;
      },
    })),
  });
  const sig = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join('|');
  const { byIp, loading } = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    let anyLoading = false;
    ips.forEach((ip, i) => {
      const data = results[i]?.data;
      m.set(ip.id, data?.data ?? []);
      if (!data) anyLoading = true;
    });
    return { byIp: m, loading: anyLoading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ips, sig]);

  const domainSig = ipDomains.join('|');
  const model: DomainWorkflowModel = useMemo(
    () => buildDomainModel(ips, byIp, ipDomains),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ips, byIp, domainSig],
  );
  const world: WorldLayout = useMemo(
    () => buildWorldLayout(model.domains, sortedPhases, byIp, model.flowsByDomain),
    [model, sortedPhases, byIp],
  );
  const totalRoutes = useMemo(
    () => world.islands.reduce((n, i) => n + i.flows.length, 0),
    [world],
  );

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

  /* ── 카메라 비행 ── */
  const flightRef = useRef<number | null>(null);
  const flyTo = useCallback((target: Camera, ms?: number) => {
    if (flightRef.current !== null) cancelAnimationFrame(flightRef.current);
    const from = camRef.current;
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    // 멀수록 오래 — "판과 판 사이를 가로질러 간다"는 느낌이 나게.
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

  /* 처음 열렸을 때(그리고 데이터가 들어와 판 크기가 확정될 때) 전체를 한 화면에. */
  useEffect(() => {
    if (fittedRef.current || !world.islands.length) return;
    if (size.w <= 240) return;
    fittedRef.current = true;
    setCam(frameRect(world.bounds, 1.16));
  }, [world, size.w, frameRect]);

  const fitAll = useCallback(() => {
    setFocusedDomain(null);
    flyTo(frameRect(world.bounds, 1.16));
  }, [flyTo, frameRect, world.bounds]);

  const focusIsland = useCallback((island: IslandLayout) => {
    setFocusedDomain(island.key);
    flyTo(frameRect({ x: island.x, y: island.y, w: island.w, h: island.h }, 1.1));
  }, [flyTo, frameRect]);

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
  const openIp = useCallback((ipId: string) => {
    if (movedRef.current) return;
    onClose();
    navigate(`/details/${projectId}/${ipId}`);
  }, [navigate, onClose, projectId]);

  /* 카메라가 어느 판 위에 있는지 → 좌측 메뉴 강조(스크롤스파이 대응물). */
  useEffect(() => {
    if (!world.islands.length) return;
    const midY = (size.h / 2 - cam.y) / cam.z;
    let best: string | null = null;
    let bestDist = Infinity;
    world.islands.forEach((i) => {
      const c = i.y + i.h / 2;
      const d = Math.abs(c - midY);
      if (d < bestDist) { bestDist = d; best = i.key; }
    });
    setActiveDomain(best);
  }, [cam, world.islands, size.h]);

  /** 줌이 낮으면 블록 글자가 어차피 안 읽히므로 접는다(LOD). */
  const detail = cam.z > 0.34;

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        projectName={projectName}
        projectCode={projectCode}
        model={model}
        totalRoutes={totalRoutes}
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
          islands={world.islands}
          active={activeDomain}
          pal={pal}
          onPick={focusIsland}
          onAll={fitAll}
        />

        {/* ── 뷰포트: 스크롤 없음, 카메라만 ── */}
        <Box
          ref={vpRef}
          onPointerDown={onPointerDown}
          sx={{
            position: 'relative', flex: 1, overflow: 'hidden', touchAction: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          <SpaceBackdrop camX={cam.x} camY={cam.y} camZ={cam.z} />

          <Box
            sx={{ position: 'absolute', inset: 0, transformOrigin: '0 0', willChange: 'transform' }}
            style={{ transform: `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.z})` }}
          >
            {world.islands.map((island) => (
              <Island
                key={island.key}
                island={island}
                pal={pal}
                detail={detail}
                dimmed={Boolean(focusedDomain) && focusedDomain !== island.key}
                onOpenIp={openIp}
              />
            ))}
          </Box>

          {!world.islands.length && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <Box sx={{ textAlign: 'center', color: T.dm2, fontSize: 13 }}>
                이 과제에서 볼 수 있는 IP가 없습니다.
              </Box>
            </Box>
          )}

          <HintBar pal={pal} />
        </Box>
      </Box>
    </Box>
  );
}

/* ═════════════════════════════════════════════════════════════ Island ═══ */

function Island({
  island, pal, detail, dimmed, onOpenIp,
}: {
  island: IslandLayout; pal: SpacePalette; detail: boolean; dimmed: boolean;
  onOpenIp: (ipId: string) => void;
}) {
  const label = island.key === UNASSIGNED_DOMAIN ? 'Unassigned' : island.label;
  const gridW = LABEL_W + GUTTER_W + island.cols.length * (island.cols[0]?.w ?? 0);

  return (
    <Box
      style={{ left: island.x, top: island.y, width: island.w, height: island.h }}
      sx={{
        position: 'absolute',
        // perspective를 판의 부모에 걸어야 rotateX가 원근으로 보인다.
        perspective: '2400px',
        opacity: dimmed ? 0.42 : 1,
        transition: 'opacity .45s',
      }}
    >
      {/* 판 아래 후광 — 공중에 뜬 물체의 접지감을 대신한다. */}
      <Box
        sx={{
          position: 'absolute', left: '4%', right: '4%', bottom: -70, height: 150,
          background: pal.plateGlow, pointerEvents: 'none',
        }}
      />

      <Box
        sx={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          transform: `rotateX(${TILT_DEG}deg)`,
          borderRadius: '26px',
          background: pal.plateBg,
          border: `1px solid ${pal.plateBorder}`,
          boxShadow: pal.plateShadow,
        }}
      >
        {/* 도메인 색 테두리 광 */}
        <Box
          sx={{
            position: 'absolute', inset: 0, borderRadius: '26px', pointerEvents: 'none',
            border: `1.5px solid ${withAlpha(island.color, 0.42)}`,
            boxShadow: `inset 0 1px 0 ${withAlpha('#ffffff', 0.18)}, 0 0 44px ${withAlpha(island.color, 0.14)}`,
          }}
        />

        {/* ── 판 머리: 도메인 이름 ── */}
        <Box
          sx={{
            position: 'absolute', left: ISLAND_PAD, top: 26, display: 'flex', alignItems: 'center', gap: '14px',
          }}
        >
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 22px',
              borderRadius: '999px', border: `1.5px solid ${withAlpha(island.color, 0.5)}`,
              background: withAlpha(island.color, 0.12),
              transform: `translateZ(${BLOCK_LIFT + 10}px)`,
            }}
          >
            <Box
              sx={{
                width: 11, height: 11, borderRadius: '50%', background: island.color,
                boxShadow: `0 0 14px ${withAlpha(island.color, 0.9)}`,
              }}
            />
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 700, letterSpacing: '.12em', color: T.tx }}>
              {label}
            </Box>
          </Box>
          <Box sx={{ fontSize: 13, color: T.dm2, fontFamily: FONT_MONO }}>
            {island.rows.length} IP · {island.released}/{island.total} released
          </Box>
        </Box>

        {island.empty ? (
          <Box
            sx={{
              position: 'absolute', left: ISLAND_PAD, top: ISLAND_HEAD_H, width: gridW, height: 110,
              display: 'grid', placeItems: 'center', color: T.dm2, fontSize: 14,
              border: `1px dashed ${pal.plateBorder}`, borderRadius: '14px',
            }}
          >
            이 도메인에 배정된 IP가 아직 없습니다.
          </Box>
        ) : (
          <>
            {/* ── Phase 열 머리 ── */}
            {island.cols.map((c) => (
              <Box
                key={c.phase.key}
                style={{ left: c.x, top: ISLAND_HEAD_H, width: c.w, height: PHASE_HEAD_H }}
                sx={{
                  position: 'absolute', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  padding: '0 12px', borderLeft: `1px solid ${pal.plateBorder}`,
                }}
              >
                {/* 진행 중 Phase 하이라이트 — T.*는 CSS 변수라 rgba로 못 섞는다(withAlpha는
                    hex 전용). 색은 그대로 쓰고 opacity로 눌러 두 테마 모두에서 동작하게 한다. */}
                {c.state === 'current' && (
                  <Box sx={{ position: 'absolute', inset: 0, background: T.tl, opacity: 0.1, pointerEvents: 'none' }} />
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', position: 'relative' }}>
                  <Box
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700,
                      color: c.state === 'current' ? T.tl : c.state === 'past' ? T.dm : T.tx,
                    }}
                  >
                    {c.phase.key}
                  </Box>
                  {c.state === 'current' && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: 8.5, fontFamily: FONT_MONO, color: '#fff', background: T.tl,
                        borderRadius: '999px', padding: '1px 6px', fontWeight: 700,
                      }}
                    >
                      NOW
                    </Box>
                  )}
                </Box>
                <Box sx={{ fontSize: 10.5, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative' }}>
                  {c.phase.label}
                </Box>
              </Box>
            ))}

            {/* Phase 열 구분선 (본문 영역) */}
            {island.cols.map((c) => (
              <Box
                key={`ln-${c.phase.key}`}
                style={{ left: c.x, top: island.contentY, height: island.rows.length * island.rowH }}
                sx={{ position: 'absolute', width: '1px', background: pal.plateBorder, pointerEvents: 'none' }}
              />
            ))}

            {/* ── IP 행 ── */}
            {island.rows.map((row) => (
              <Box key={row.ip.id}>
                <Box
                  component="button"
                  onClick={() => onOpenIp(row.ip.id)}
                  title={`${row.ip.name} — open IP board`}
                  style={{ left: ISLAND_PAD, top: row.y + 10, width: LABEL_W - 14, height: row.h - 20 }}
                  sx={{
                    position: 'absolute', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    alignItems: 'flex-start', gap: '3px', padding: '0 14px', textAlign: 'left',
                    borderRadius: '13px', border: `1px solid ${pal.plateBorder}`,
                    borderLeft: `4px solid ${row.ip.color || T.tl}`,
                    background: withAlpha(row.ip.color || '#0c9a83', 0.07),
                    cursor: CURSOR_POINTER, fontFamily: 'inherit',
                    transform: `translateZ(${BLOCK_LIFT * 0.6}px)`,
                    transition: 'background .16s',
                    '&:hover': { background: withAlpha(row.ip.color || '#0c9a83', 0.16) },
                  }}
                >
                  <Box sx={{ fontSize: 16, fontWeight: 700, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {row.ip.name}
                  </Box>
                  {detail && (
                    <>
                      <Box sx={{ fontSize: 11.5, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {row.ip.description || '—'}
                      </Box>
                      <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, mt: '2px' }}>
                        {row.released}/{row.total} released
                      </Box>
                    </>
                  )}
                </Box>

                {/* 산출물 블록 */}
                {row.blocks.map((b, i) => (
                  <DeliverableBlock key={b.id} b={b} pal={pal} detail={detail} index={i} />
                ))}
              </Box>
            ))}

            {/* ── 거터 곡선: 같은 도메인 IP↔IP 흐름 ── */}
            {island.flows.length > 0 && (
              <Box
                component="svg"
                style={{ left: 0, top: 0, width: island.w, height: island.h }}
                sx={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', transform: `translateZ(${BLOCK_LIFT * 0.3}px)` }}
              >
                {island.flows.map((f) => (
                  <g key={f.id}>
                    <path d={f.d} fill="none" stroke={f.color} strokeWidth={f.width} strokeLinecap="round" opacity={0.8}>
                      <title>{f.title}</title>
                    </path>
                    <polygon
                      points={`${f.tipX},${f.tipY} ${f.tipX + 10},${f.tipY - 5.5} ${f.tipX + 10},${f.tipY + 5.5}`}
                      fill={f.color}
                      opacity={0.9}
                    />
                  </g>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

function DeliverableBlock({
  b, pal, detail, index,
}: { b: BlockNode; pal: SpacePalette; detail: boolean; index: number }) {
  const color = STATUS_COLOR[b.status];
  return (
    <Box
      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
      sx={{ position: 'absolute', transform: `translateZ(${BLOCK_LIFT}px)` }}
    >
      <Box
        className="dw-bob"
        style={{ animationDelay: `${(index % 5) * 0.55}s` }}
        sx={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: '9px',
          padding: '0 12px 0 0', borderRadius: '11px', overflow: 'hidden',
          // 줌아웃 상태에서는 이름이 어차피 안 읽히므로 블록 자체를 상태색 막대로 바꾼다 —
          // 그러면 전체 조망이 "과제 전체 릴리즈 상태 지도"로 읽힌다.
          background: detail ? pal.plateBg : color,
          border: `1px solid ${detail ? pal.plateBorder : 'transparent'}`,
          boxShadow: pal.plateShadow,
          animation: 'dw-bob 5.5s ease-in-out infinite',
        }}
        title={`${b.name}\n${b.status === 'released' ? 'Released' : b.status === 'inProgress' ? 'In progress' : 'Not submitted'}`}
      >
        {detail && (
          <>
            <Box sx={{ alignSelf: 'stretch', width: 5, background: color, flex: '0 0 auto' }} />
            <Box sx={{ color: T.dm, flex: '0 0 auto', display: 'flex' }}>
              <DocIcon type={b.docType} size={15} />
            </Box>
            <Box
              sx={{
                fontSize: 13, fontWeight: 500, color: T.tx, flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {b.name}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

/* ═════════════════════════════════════════════════════════════ Chrome ═══ */

function TopBar({
  projectName, projectCode, model, totalRoutes, loading, zoom, pal,
  onZoomIn, onZoomOut, onFit, onClose,
}: {
  projectName: string; projectCode: string; model: DomainWorkflowModel;
  totalRoutes: number; loading: boolean; zoom: number; pal: SpacePalette;
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
        <Stat label="DOMAINS" value={model.domains.length} />
        <Stat label="IPS" value={model.domains.reduce((n, d) => n + d.ips.length, 0)} />
        <Stat label="ROUTES" value={totalRoutes} />
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
  islands, active, pal, onPick, onAll,
}: {
  islands: IslandLayout[]; active: string | null; pal: SpacePalette;
  onPick: (island: IslandLayout) => void; onAll: () => void;
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
        {islands.map((d) => {
          const pct = d.total ? Math.round((d.released / d.total) * 100) : 0;
          const on = active === d.key;
          const label = d.key === UNASSIGNED_DOMAIN ? 'Unassigned' : d.key;
          return (
            <Box
              key={d.key}
              component="button"
              onClick={() => onPick(d)}
              sx={{
                textAlign: 'left', width: '100%', border: '1px solid', borderRadius: '9px',
                padding: '8px 10px', cursor: CURSOR_POINTER, fontFamily: 'inherit', transition: '.14s',
                borderColor: on ? withAlpha(d.color, 0.55) : 'transparent',
                background: on ? withAlpha(d.color, 0.12) : 'transparent',
                '&:hover': { background: on ? withAlpha(d.color, 0.16) : T.sf3 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: '50%', background: d.color, flex: '0 0 auto',
                    boxShadow: on ? `0 0 9px ${withAlpha(d.color, 0.9)}` : 'none',
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
                {d.rows.length} IP · {d.released}/{d.total} released
              </Box>
              <Box sx={{ height: 3, borderRadius: 999, background: T.sf3, mt: '5px', ml: '16px', overflow: 'hidden' }}>
                <Box sx={{ width: `${pct}%`, height: '100%', background: d.color, transition: 'width .3s' }} />
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
    </Box>
  );
}
