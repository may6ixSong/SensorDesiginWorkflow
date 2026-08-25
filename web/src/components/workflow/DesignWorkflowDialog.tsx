import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { DeliverableDto, DeliverablesListResponse, IpDto, PhaseRef } from '@/types/domain';
import { DocIcon, Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import { buildDomainModel, withAlpha, lighten, darken, DomainWorkflowModel, UNASSIGNED_DOMAIN } from '@/lib/domainWorkflow';
import { useThemeMode } from '@/theme/ThemeModeContext';
import {
  buildWorldLayout, BlockNode, IslandLayout, WorldLayout,
  GUTTER_W, ISLAND_PAD, LABEL_W, PHASE_HEAD_H,
} from '@/lib/designWorkflowLayout';
import { SpaceBackdrop, SpacePalette, useSpacePalette } from './spaceBackdrop';

/* ──────────────────────────────────────────────────────────────────────────
 * Design Workflow — 과제 전체를 하나의 우주로 펼쳐 보는 뷰(초안 우주 뷰의 재현).
 *
 * 중요한 원칙: 아무것도 가두지 않는다. Domain도, Phase도 사각형 판/카드/테두리로
 * 감싸지 않는다 — 하나의 연속된 우주 공간 안에서 도메인끼리는 아주 옅은 대시 선
 * (가로 threshold) 하나로만 구분되고, 그 안의 Phase끼리도 아주 옅은 대시 선(세로)
 * 으로만 구분된다. 이 선들은 "그 너머에 다른 영역이 있다"는 표시일 뿐 무언가를
 * 감싸는 프레임이 아니다 — 그래서 도메인 영역의 왼쪽·오른쪽·아래는 아예 선이 없다.
 *
 *   Domain  = 우주의 한 구역. 성운(흐린 색 구름)으로 영역감만 주고, 시작점에 옅은
 *             가로 대시 라인 + 라벨이 뜬다(박스 없음).
 *   IP      = 그 구역 안에서 이름이 떠 있는 한 줄. 라벨도 박스 없이 점 + 텍스트.
 *   산출물   = 실제 광원이 있는 3D 구체(sphere) — 카드가 아니다. lighten→base→darken
 *             그라디언트 음영 + 발광 + bob 애니메이션.
 *   흐름     = 같은 도메인 안의 IP↔IP 산출물 핸드오프만 곡선으로.
 *
 * 조작은 IP 캔버스와 동일하다 — 휠=줌(커서 기준), 드래그=시점 이동. 스크롤바는 없다.
 * 좌측 메뉴에서 도메인을 고르면 카메라가 그 구역까지 부드럽게 날아간다.
 * ────────────────────────────────────────────────────────────────────────── */

const NAV_W = 224;
const TOPBAR_H = 60;
const Z_MIN = 0.09;
const Z_MAX = 1.9;

const STATUS_COLOR = {
  released: T.tl,
  inProgress: T.am,
  notSubmitted: T.dm2,
} as const;

/**
 * 산출물 블록을 실제 3D 구체(sphere)로 음영 처리하려면 lighten()/darken()에 넘길
 * "진짜 hex"가 필요하다 — T.tl 등은 CSS 변수 문자열이라 색상 연산이 안 된다
 * (index.html의 :root / [data-theme='dark'] 값과 정확히 맞춘 사본).
 */
const STATUS_HEX: Record<'light' | 'dark', Record<'released' | 'inProgress' | 'notSubmitted', string>> = {
  light: { released: '#0c9a83', inProgress: '#ac6f08', notSubmitted: '#8b99ab' },
  dark: { released: '#2ee6c5', inProgress: '#f0b84e', notSubmitted: '#6b7891' },
};

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
  const { mode } = useThemeMode();
  const statusHex = STATUS_HEX[mode];
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
            {world.islands.map((island, idx) => (
              <DomainZone
                key={island.key}
                island={island}
                statusHex={statusHex}
                detail={detail}
                dimmed={Boolean(focusedDomain) && focusedDomain !== island.key}
                isLast={idx === world.islands.length - 1}
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

/* ══════════════════════════════════════════════════════════ DomainZone ═══ */

const HAIR_DOMAIN = 0.34;
const HAIR_PHASE = 0.16;

/**
 * 도메인 하나의 영역. 판도, 카드도, 테두리도 없다 — 성운(흐린 구름)으로 영역감을
 * 주고, 시작점에 아주 옅은 가로 대시 라인 + 라벨만 띄운다. 그 안의 Phase 구분도
 * 옅은 세로 대시 라인뿐이다. 모든 라벨은 박스 없이 점 + 텍스트로 떠 있고, 별이
 * 흐린 뒤에서도 읽히도록 텍스트 자체에 halo(text-shadow)를 건다.
 */
function DomainZone({
  island, statusHex, detail, dimmed, isLast, onOpenIp,
}: {
  island: IslandLayout; statusHex: Record<'released' | 'inProgress' | 'notSubmitted', string>;
  detail: boolean; dimmed: boolean; isLast: boolean;
  onOpenIp: (ipId: string) => void;
}) {
  const label = island.key === UNASSIGNED_DOMAIN ? 'Unassigned' : island.label;
  const gridW = LABEL_W + GUTTER_W + island.cols.length * (island.cols[0]?.w ?? 0);
  const lineW = gridW + ISLAND_PAD * 1.4;
  const bodyH = island.contentY + Math.max(1, island.rows.length) * island.rowH;

  return (
    <Box
      style={{ left: island.x, top: island.y, width: island.w, height: island.h }}
      sx={{ position: 'absolute', opacity: dimmed ? 0.36 : 1, transition: 'opacity .45s' }}
    >
      {/* 도메인 성운 — 경계가 아니라 영역감. 판보다 훨씬 크고 흐려서 카메라를
          당겨도 각지지 않는다. 이게 이 화면에서 "도메인"을 나타내는 유일한 배경이다. */}
      <Box
        sx={{
          position: 'absolute', left: '50%', top: '46%', width: island.w * 1.75, height: island.w * 1.75,
          transform: 'translate(-50%, -50%)', borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${withAlpha(island.color, 0.17)} 0%, ${withAlpha(island.color, 0.055)} 44%, transparent 72%)`,
          filter: 'blur(20px)',
        }}
      />

      {/* 상단 threshold — 가로 대시 한 줄. 왼쪽·오른쪽·아래에는 선이 없다: 이건
          프레임이 아니라 "여기서부터 이 도메인"이라는 문턱 하나일 뿐이다. */}
      <Box
        style={{ left: 0, top: ISLAND_PAD, width: lineW }}
        sx={{ position: 'absolute', height: 0, borderTop: `1px dashed ${withAlpha(island.color, HAIR_DOMAIN)}`, pointerEvents: 'none' }}
      />
      <Box style={{ left: ISLAND_PAD, top: ISLAND_PAD - 22 }} sx={{ position: 'absolute', display: 'flex', alignItems: 'baseline', gap: '13px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: island.color, boxShadow: `0 0 12px ${withAlpha(island.color, 0.85)}` }} />
          <Halo sx={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, letterSpacing: '.12em', color: T.tx }}>
            {label}
          </Halo>
        </Box>
        <Halo sx={{ fontSize: 12.5, color: T.dm2, fontFamily: FONT_MONO }}>
          {island.rows.length} IP · {island.released}/{island.total} released
        </Halo>
      </Box>

      {island.empty ? (
        <Halo
          style={{ left: ISLAND_PAD, top: island.contentY }}
          sx={{ position: 'absolute', fontSize: 13, color: T.dm2 }}
        >
          이 도메인에 배정된 IP가 아직 없습니다.
        </Halo>
      ) : (
        <>
          {/* ── Phase 문턱: 세로 대시 라인 + 떠 있는 라벨. 지금 Phase만 은은한
              실선 + 발광으로 살짝 도드라지게 — 그것도 채워진 배경이 아니라 선이다. */}
          {island.cols.map((c) => {
            const cur = c.state === 'current';
            return (
              <Box key={c.phase.key}>
                <Box
                  style={{ left: c.x, top: island.contentY - PHASE_HEAD_H, height: PHASE_HEAD_H + island.rows.length * island.rowH }}
                  sx={{
                    position: 'absolute', width: 0, pointerEvents: 'none',
                    borderLeft: cur
                      ? `1.5px solid ${withAlpha(island.color, 0.55)}`
                      : `1px dashed ${withAlpha(island.color, HAIR_PHASE)}`,
                    boxShadow: cur ? `0 0 10px ${withAlpha(island.color, 0.4)}` : 'none',
                  }}
                />
                <Halo
                  style={{ left: c.x + 10, top: island.contentY - PHASE_HEAD_H + 6 }}
                  sx={{ position: 'absolute', width: c.w - 16 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: cur ? T.tl : c.state === 'past' ? T.dm : T.tx }}>
                      {c.phase.key}
                    </Box>
                    {cur && (
                      <Box
                        component="span"
                        sx={{
                          fontSize: 8, fontFamily: FONT_MONO, color: '#fff', background: T.tl,
                          borderRadius: '999px', padding: '1px 6px', fontWeight: 700,
                        }}
                      >
                        NOW
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ fontSize: 10, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.phase.label}
                  </Box>
                </Halo>
              </Box>
            );
          })}

          {/* ── IP 행: 박스 없이 점 + 이름만 떠 있는 라벨. ── */}
          {island.rows.map((row) => (
            <Box key={row.ip.id}>
              <Box
                component="button"
                onClick={() => onOpenIp(row.ip.id)}
                title={`${row.ip.name} — open IP board`}
                style={{ left: ISLAND_PAD, top: row.y + row.h / 2 - 20, width: LABEL_W - 14 }}
                sx={{
                  position: 'absolute', display: 'flex', flexDirection: 'column', gap: '2px',
                  alignItems: 'flex-start', textAlign: 'left', background: 'transparent', border: 'none',
                  padding: 0, cursor: CURSOR_POINTER, fontFamily: 'inherit', color: 'inherit',
                  '&:hover .dw-ip-name': { color: row.ip.color || T.tl },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%' }}>
                  <Box
                    sx={{
                      width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
                      background: row.ip.color || T.tl, boxShadow: `0 0 8px ${withAlpha(row.ip.color || '#0c9a83', 0.75)}`,
                    }}
                  />
                  <Halo
                    className="dw-ip-name"
                    sx={{
                      fontSize: 15, fontWeight: 700, color: T.tx, transition: 'color .15s',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190,
                    }}
                  >
                    {row.ip.name}
                  </Halo>
                </Box>
                {detail && (
                  <Halo sx={{ fontSize: 10.5, color: T.dm2, ml: '17px' }}>
                    {row.released}/{row.total} released
                  </Halo>
                )}
              </Box>

              {/* 산출물 블록 — 진짜 3D 구체. */}
              {row.blocks.map((b, i) => (
                <DeliverableBlock key={b.id} b={b} hex={statusHex[b.status]} detail={detail} index={i} />
              ))}
            </Box>
          ))}

          {/* ── 거터 곡선: 같은 도메인 IP↔IP 흐름. ── */}
          {island.flows.length > 0 && (
            <Box
              component="svg"
              style={{ left: 0, top: 0, width: island.w, height: bodyH }}
              sx={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}
            >
              {island.flows.map((f) => (
                <g key={f.id}>
                  <path d={f.d} fill="none" stroke={f.color} strokeWidth={f.width} strokeLinecap="round" opacity={0.75}>
                    <title>{f.title}</title>
                  </path>
                  <polygon
                    points={`${f.tipX},${f.tipY} ${f.tipX + 10},${f.tipY - 5.5} ${f.tipX + 10},${f.tipY + 5.5}`}
                    fill={f.color}
                    opacity={0.85}
                  />
                </g>
              ))}
            </Box>
          )}
        </>
      )}

      {/* 마지막 도메인 다음엔 우주를 닫는 대시 라인 하나(라벨 없음) — 스케치의
          맨 마지막 "----" 줄과 같다. */}
      {isLast && (
        <Box
          style={{ left: 0, top: island.h - ISLAND_PAD * 0.5, width: lineW }}
          sx={{ position: 'absolute', height: 0, borderTop: `1px dashed ${withAlpha(island.color, HAIR_DOMAIN * 0.7)}`, pointerEvents: 'none' }}
        />
      )}
    </Box>
  );
}

/** 별이 흐린 배경 위에서도 박스 없이 읽히도록 은은한 halo(text-shadow)를 까는 래퍼. */
function Halo({ children, sx, style, className }: { children: React.ReactNode; sx?: object; style?: React.CSSProperties; className?: string }) {
  return (
    <Box
      className={className}
      style={style}
      sx={{
        textShadow: '0 1px 2px rgba(0,0,0,.55), 0 0 14px rgba(0,0,0,.45)',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * 산출물 = 초안 우주 뷰의 "행성"을 그대로 다시 쓴 것 — 카드가 아니라 실제로 광원이
 * 있는 구체다. 배경은 두 겹의 radial-gradient로 만든다: 위쪽은 하이라이트(광원),
 * 아래쪽은 lighten→base→darken 그라디언트로 둥근 음영을 준다. bob 애니메이션이 얹혀
 * 정지 화면에서도 공중에 떠 있는 게 읽힌다.
 */
function DeliverableBlock({
  b, hex, detail, index,
}: { b: BlockNode; hex: string; detail: boolean; index: number }) {
  const d = Math.min(b.h, 46);
  const sphereBg = [
    `radial-gradient(circle at 30% 24%, ${withAlpha('#ffffff', 0.95)}, ${withAlpha('#ffffff', 0)} 42%)`,
    `radial-gradient(circle at 42% 38%, ${lighten(hex, 0.55)} 0%, ${hex} 55%, ${darken(hex, 0.55)} 100%)`,
  ].join(',');

  return (
    <Box
      style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
      sx={{ position: 'absolute' }}
    >
      <Box
        className="dw-bob"
        style={{ animationDelay: `${(index % 5) * 0.55}s` }}
        sx={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'dw-bob 5.5s ease-in-out infinite',
        }}
        title={`${b.name}\n${b.status === 'released' ? 'Released' : b.status === 'inProgress' ? 'In progress' : 'Not submitted'}`}
      >
        {/* 구체 — 위 하이라이트 + 아래 그라디언트 음영 + 은은한 발광. */}
        <Box
          sx={{
            position: 'relative', width: d, height: d, borderRadius: '50%', flex: '0 0 auto',
            background: sphereBg,
            boxShadow: `0 0 ${d * 0.6}px ${withAlpha(hex, 0.55)}, 0 3px 8px ${withAlpha('#000000', 0.35)}`,
          }}
        >
          {detail && (
            <Box
              sx={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                color: withAlpha('#ffffff', 0.92), filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
              }}
            >
              <DocIcon type={b.docType} size={Math.round(d * 0.42)} />
            </Box>
          )}
        </Box>

        {detail && (
          <Box
            sx={{
              fontSize: 13, fontWeight: 500, color: T.tx, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textShadow: `0 1px 3px ${withAlpha('#000000', 0.25)}`,
            }}
          >
            {b.name}
          </Box>
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
