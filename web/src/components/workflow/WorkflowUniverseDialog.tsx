import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { DeliverableDto, DeliverablesListResponse, IpDto } from '@/types/domain';
import { Icon } from '@/components/common/Icon';
import { findDirectoryUser } from '@/shared/constants/mock-users';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';
import {
  buildUniverse, darken, flowGeometry, lighten, seededStars, withAlpha,
  FlowLink, PlanetNode, SystemNode, UniverseModel, UNASSIGNED_DOMAIN,
} from '@/lib/workflowUniverse';
import { SPACE, STATUS_COLOR, UNIVERSE_KEYFRAMES } from './universeTheme';

/* ──────────────────────────────────────────────────────────────────────────
 * Total workflow view — 과제의 모든 IP를 한 화면에서 보는 "우주 지도".
 *
 *   Domain  → 항성계(별 하나 + 성운 + 궤도)
 *   IP      → 그 궤도를 도는 행성 (크기 = 산출물 수, 링 = Release 진척도)
 *   산출물 흐름(recvIpId) → 행성을 잇는 항로 (도메인을 넘으면 점선 장거리 항로)
 *
 * IP가 늘어나면 한 판이 순식간에 읽기 어려워지므로, 좌표 영역 자체를 도메인 단위로
 * 갈라 놓고 좌측 SECTORS 메뉴로 한 항성계씩 포커스해 들어가는 방식을 택했다.
 * 레이아웃 계산은 전부 `@/lib/workflowUniverse`에 있고 여기서는 그리기만 한다.
 * ────────────────────────────────────────────────────────────────────────── */

interface View { x: number; y: number; k: number }

const RAIL_W = 236;
const PANEL_W = 312;
const MIN_K = 0.1;
const MAX_K = 2.6;
const STAR_W = 1600;
const STAR_H = 1000;
/** 이 배율 아래에서는 행성 이름/궤도 디테일을 접는다 (LOD). */
const LABEL_K = 0.34;
const DETAIL_K = 0.52;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 라벨 역스케일. 지도를 축소하면 글자도 같이 줄어 읽을 수 없게 되므로, 확대율의 역수를
 * 곱해 화면상 크기를 거의 일정하게 유지한다(지도 앱의 지명과 같은 동작).
 */
const labelScale = (k: number) => clamp(1 / k, 0.75, 2.6);

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectCode: string;
  ips: IpDto[];
}

export function WorkflowUniverseDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullScreen
      PaperProps={{ sx: { background: SPACE.void0, overflow: 'hidden' } }}
    >
      <style>{UNIVERSE_KEYFRAMES}</style>
      {props.open && <UniverseStage {...props} />}
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════ Stage ═══ */

function UniverseStage({ onClose, projectId, projectName, projectCode, ips }: Props) {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const touchedRef = useRef(false);

  /* ── 모든 IP의 산출물을 한 번에 — 캐시 키는 IP 보드와 같아 이미 열어본 IP는 즉시 뜬다. ── */
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
  const { byIp, loadingIds } = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    const l = new Set<string>();
    ips.forEach((ip, i) => {
      const data = results[i]?.data;
      m.set(ip.id, data?.data ?? []);
      if (!data) l.add(ip.id);
    });
    return { byIp: m, loadingIds: l };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ips, sig]);

  const model: UniverseModel = useMemo(
    () => buildUniverse(ips, byIp, loadingIds),
    [ips, byIp, loadingIds],
  );

  /* ── 컨테이너 크기 추적 ── */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(320, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 카메라 이동 애니메이션 ── */
  const rafRef = useRef<number | null>(null);
  const animateTo = useCallback((target: View, ms = 640) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = viewRef.current;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        k: from.k + (target.k - from.k) * e,
      });
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  /** 좌측 레일/우측 패널을 제외한 실제 보이는 영역의 중심. */
  const focalPoint = useCallback(
    (withPanel: boolean) => {
      const left = RAIL_W;
      const right = withPanel ? PANEL_W : 0;
      return { fx: left + (size.w - left - right) / 2, fy: size.h / 2 + 12 };
    },
    [size.w, size.h],
  );

  const frame = useCallback(
    (cx: number, cy: number, radius: number, withPanel: boolean, pad = 1.3) => {
      const left = RAIL_W;
      const right = withPanel ? PANEL_W : 0;
      const availW = Math.max(240, size.w - left - right - 60);
      const availH = Math.max(240, size.h - 150);
      const k = clamp(Math.min(availW / (radius * 2 * pad), availH / (radius * 2 * pad)), MIN_K, MAX_K);
      const { fx, fy } = focalPoint(withPanel);
      return { k, x: fx - cx * k, y: fy - cy * k };
    },
    [size.w, size.h, focalPoint],
  );

  const fitAll = useCallback((animate = true) => {
    const b = model.bounds;
    const radius = Math.max(b.w, b.h) / 2 || 600;
    const next = frame(b.x + b.w / 2, b.y + b.h / 2, radius, false, 1.06);
    if (animate) animateTo(next); else setView(next);
  }, [model.bounds, frame, animateTo]);

  /* 사용자가 아직 화면을 만지지 않았다면 데이터가 들어올 때마다 다시 맞춘다. */
  useEffect(() => {
    if (!touchedRef.current) fitAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, model.bounds.w, model.bounds.h]);

  const focusSystem = useCallback((s: SystemNode) => {
    touchedRef.current = true;
    setActiveDomain(s.key);
    setSelectedId(null);
    animateTo(frame(s.cx, s.cy, s.radius, false, 1.16));
  }, [frame, animateTo]);

  const focusPlanet = useCallback((p: PlanetNode) => {
    touchedRef.current = true;
    setSelectedId(p.id);
    setActiveDomain(p.domain);
    animateTo(frame(p.x, p.y, p.r * 7, true, 1));
  }, [frame, animateTo]);

  const showAll = useCallback(() => {
    setActiveDomain(null);
    setSelectedId(null);
    touchedRef.current = false;
    fitAll();
  }, [fitAll]);

  const zoomBy = useCallback((factor: number) => {
    touchedRef.current = true;
    const v = viewRef.current;
    const { fx, fy } = focalPoint(Boolean(selectedId));
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    animateTo({ k, x: fx - ((fx - v.x) / v.k) * k, y: fy - ((fy - v.y) / v.k) * k }, 260);
  }, [focalPoint, animateTo, selectedId]);

  /* ── 팬 / 휠 줌 ──
   * setPointerCapture는 쓰지 않는다 — 캡처를 걸면 이후 click 이벤트의 타깃까지 <svg>로
   * 바뀌어 버려서 안쪽 <g>(행성·섹터 라벨)의 onClick이 영영 안 불린다. 대신 드래그
   * 동안만 window에 리스너를 달고, 4px 이상 움직였으면 그 뒤에 오는 click은 무시한다. */
  const dragRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    touchedRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    dragRef.current = { px: e.clientX, py: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
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
      if (Math.hypot(dx, dy) > 4) movedRef.current = true;
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
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
  const guarded = (fn: () => void) => () => { if (!movedRef.current) fn(); };

  const onPointerMove = (e: React.PointerEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const onWheel = (e: React.WheelEvent) => {
    touchedRef.current = true;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), MIN_K, MAX_K);
      return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
    });
  };

  /* ── 강조/흐리기 판정 ── */
  const neighbours = useMemo(() => {
    if (!hoverId && !selectedId) return null;
    const id = hoverId ?? selectedId!;
    const set = new Set<string>([id]);
    model.flows.forEach((f) => {
      if (f.from === id) set.add(f.to);
      if (f.to === id) set.add(f.from);
    });
    return { id, set };
  }, [hoverId, selectedId, model.flows]);

  const planetAlpha = (p: PlanetNode) => {
    if (neighbours) return neighbours.set.has(p.id) ? 1 : 0.16;
    if (activeDomain) return p.domain === activeDomain ? 1 : 0.2;
    return 1;
  };
  const flowAlpha = (f: FlowLink) => {
    if (neighbours) {
      return f.from === neighbours.id || f.to === neighbours.id ? 1 : 0.05;
    }
    if (activeDomain) {
      const a = f.fromDomain === activeDomain;
      const b = f.toDomain === activeDomain;
      return a && b ? 1 : a || b ? 0.55 : 0.05;
    }
    return 0.85;
  };

  const selected = selectedId ? model.planetById.get(selectedId) ?? null : null;
  const hovered = hoverId ? model.planetById.get(hoverId) ?? null : null;
  const loading = loadingIds.size > 0;

  return (
    <Box
      ref={hostRef}
      sx={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        background: `radial-gradient(1200px 800px at 22% 8%, ${SPACE.void2} 0%, ${SPACE.void1} 42%, ${SPACE.void0} 100%)`,
        color: SPACE.tx,
        userSelect: 'none',
      }}
    >
      <Starfield view={view} />

      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
        style={{ position: 'absolute', inset: 0, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <defs>
          <radialGradient id="wu-shade" cx="32%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".34" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000814" stopOpacity=".62" />
          </radialGradient>
          {model.systems.map((s) => (
            <radialGradient key={`neb-${s.key}`} id={`wu-neb-${cssId(s.key)}`}>
              <stop offset="0%" stopColor={s.color} stopOpacity=".085" />
              <stop offset="58%" stopColor={s.color} stopOpacity=".04" />
              <stop offset="88%" stopColor={s.color} stopOpacity=".016" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </radialGradient>
          ))}
          {model.systems.map((s) => (
            <radialGradient key={`cor-${s.key}`} id={`wu-cor-${cssId(s.key)}`}>
              <stop offset="0%" stopColor="#ffffff" stopOpacity=".82" />
              <stop offset="16%" stopColor={lighten(s.color, 0.4)} stopOpacity=".42" />
              <stop offset="52%" stopColor={s.color} stopOpacity=".12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </radialGradient>
          ))}
          {model.planets.map((p) => {
            const c = p.ip.color || SPACE.ice;
            return (
              <g key={`g-${p.id}`}>
                <radialGradient id={`wu-p-${p.id}`} cx="33%" cy="27%" r="78%">
                  <stop offset="0%" stopColor={lighten(c, 0.55)} />
                  <stop offset="52%" stopColor={c} />
                  <stop offset="100%" stopColor={darken(c, 0.55)} />
                </radialGradient>
                <radialGradient id={`wu-h-${p.id}`}>
                  <stop offset="55%" stopColor={c} stopOpacity=".38" />
                  <stop offset="100%" stopColor={c} stopOpacity="0" />
                </radialGradient>
              </g>
            );
          })}
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* ── 성운 + 궤도 + 별 ── */}
          {model.systems.map((s) => (
            <SystemLayer
              key={s.key}
              system={s}
              k={view.k}
              alpha={activeDomain && s.key !== activeDomain ? 0.24 : 1}
              onSelect={guarded(() => focusSystem(s))}
            />
          ))}

          {/* ── 항로 ── */}
          {model.flows.map((f) => {
            const a = model.planetById.get(f.from);
            const b = model.planetById.get(f.to);
            if (!a || !b) return null;
            return (
              <FlowPath
                key={f.id}
                flow={f}
                a={a}
                b={b}
                alpha={flowAlpha(f)}
                animate={view.k > 0.24 && flowAlpha(f) > 0.5}
              />
            );
          })}

          {/* ── 행성 ── */}
          {model.planets.map((p) => (
            <Planet
              key={p.id}
              p={p}
              k={view.k}
              alpha={planetAlpha(p)}
              active={selectedId === p.id}
              onEnter={() => setHoverId(p.id)}
              onLeave={() => setHoverId((cur) => (cur === p.id ? null : cur))}
              onSelect={guarded(() => focusPlanet(p))}
            />
          ))}
        </g>
      </svg>

      {/* ══ 상단 바 ══ */}
      <TopBar
        projectName={projectName}
        projectCode={projectCode}
        model={model}
        loading={loading}
        onZoomIn={() => zoomBy(1.35)}
        onZoomOut={() => zoomBy(1 / 1.35)}
        onFit={showAll}
        onClose={onClose}
      />

      {/* ══ 좌측 SECTORS 메뉴 ══ */}
      <SectorRail
        systems={model.systems}
        active={activeDomain}
        totalIps={model.planets.length}
        onAll={showAll}
        onPick={focusSystem}
      />

      <FlowLegend flows={model.flows} />

      {/* ══ 우측 상세 패널 ══ */}
      {selected && (
        <DetailPanel
          planet={selected}
          model={model}
          onClose={() => setSelectedId(null)}
          onOpenBoard={() => { onClose(); navigate(`/details/${projectId}/${selected.ip.id}`); }}
          onHop={(id) => {
            const next = model.planetById.get(id);
            if (next) focusPlanet(next);
          }}
        />
      )}

      {/* ══ 호버 툴팁 ══ */}
      {hovered && hovered.id !== selectedId && !dragging && (
        <HoverCard planet={hovered} x={cursor.x} y={cursor.y} hostW={size.w} />
      )}

      {!ips.length && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <Box sx={{ textAlign: 'center', color: SPACE.dm2, fontSize: 13 }}>
            이 과제에서 볼 수 있는 IP가 없습니다.
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════ Starfield ═══ */

function Starfield({ view }: { view: View }) {
  const layers = useMemo(
    () => [
      { stars: seededStars(7, 190, STAR_W, STAR_H), p: 0.04, scale: 1 },
      { stars: seededStars(23, 95, STAR_W, STAR_H), p: 0.1, scale: 1.4 },
      { stars: seededStars(91, 34, STAR_W, STAR_H), p: 0.2, scale: 2.1 },
    ],
    [],
  );
  return (
    <>
      {layers.map((l, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute', inset: '-14%', pointerEvents: 'none',
            transform: `translate3d(${view.x * l.p}px, ${view.y * l.p}px, 0)`,
          }}
        >
          <svg width="100%" height="100%" viewBox={`0 0 ${STAR_W} ${STAR_H}`} preserveAspectRatio="xMidYMid slice">
            {l.stars.map((s) => (
              <circle
                key={s.id}
                cx={s.x}
                cy={s.y}
                r={s.r * l.scale}
                fill="#dbe8ff"
                opacity={s.o}
                className="wu-anim"
                style={{ animation: `wu-twinkle ${5 + s.delay}s ease-in-out ${s.delay}s infinite` }}
              />
            ))}
          </svg>
        </Box>
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════ System ═══ */

function SystemLayer({
  system, k, alpha, onSelect,
}: { system: SystemNode; k: number; alpha: number; onSelect: () => void }) {
  const id = cssId(system.key);
  const showOrbits = k > 0.16;
  const titleW = Math.max(150, system.label.length * 12 + 96);
  return (
    <g opacity={alpha} style={{ transition: 'opacity .35s' }}>
      {/* 도메인 영역 자체를 눈에 보이게 — 성운(채움) + 경계선(테두리).
          IP가 늘어나도 "어디부터 어디까지가 이 도메인인지"가 먼저 읽혀야 하므로,
          경계선은 non-scaling-stroke로 축소해도 사라지지 않게 한다. */}
      <circle cx={system.cx} cy={system.cy} r={system.radius} fill={`url(#wu-neb-${id})`} />
      <circle
        cx={system.cx}
        cy={system.cy}
        r={system.radius}
        fill="none"
        stroke={withAlpha(system.color, 0.34)}
        strokeWidth={1.4}
        strokeDasharray="13 11"
        vectorEffect="non-scaling-stroke"
      />

      {showOrbits && system.orbits.map((r, i) => (
        <circle
          key={r}
          cx={system.cx}
          cy={system.cy}
          r={r}
          fill="none"
          stroke={withAlpha(system.color, 0.15)}
          strokeWidth={1}
          strokeDasharray="3 11"
          vectorEffect="non-scaling-stroke"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${system.cx} ${system.cy}`}
            to={`${i % 2 ? -360 : 360} ${system.cx} ${system.cy}`}
            dur={`${150 + i * 60}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* 중심 별 — 행성보다 눈에 덜 띄어야 해서 코어는 작게, 코로나는 얕게. */}
      <g transform={`translate(${system.cx}, ${system.cy})`} style={{ pointerEvents: 'none' }}>
        <circle
          r={78}
          fill={`url(#wu-cor-${id})`}
          className="wu-anim"
          style={{ animation: 'wu-breathe 7s ease-in-out infinite', transformOrigin: 'center' }}
        />
        <circle r={11} fill={lighten(system.color, 0.72)} />
        {k > DETAIL_K && (
          <g stroke={withAlpha(system.color, 0.32)} strokeWidth={0.9}>
            <line x1={-26} y1={0} x2={26} y2={0} />
            <line x1={0} y1={-26} x2={0} y2={26} />
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="90s" repeatCount="indefinite" />
          </g>
        )}
      </g>

      {/* 섹터 제목 — 경계 원 위쪽에 걸치게 놓아 영역의 이름표처럼 읽히게 한다. */}
      <g
        transform={`translate(${system.cx}, ${system.cy - system.radius}) scale(${labelScale(k)})`}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x={-titleW / 2}
          y={-25}
          width={titleW}
          height={50}
          rx={25}
          fill="rgba(5,9,20,.86)"
          stroke={withAlpha(system.color, 0.5)}
          strokeWidth={1.3}
        />
        <circle cx={-titleW / 2 + 27} cy={0} r={6.5} fill={system.color} />
        <text
          x={12}
          y={-2}
          textAnchor="middle"
          fill={SPACE.tx}
          fontFamily={FONT_MONO}
          fontSize={20}
          fontWeight={700}
          letterSpacing="2.2"
        >
          {system.label}
        </text>
        <text x={12} y={15} textAnchor="middle" fill={withAlpha(system.color, 0.9)} fontFamily={FONT_MONO} fontSize={11}>
          {system.planets.length} IP · {system.counts.released}/{system.counts.total} released
        </text>
      </g>
    </g>
  );
}

/* ════════════════════════════════════════════════════════════════ Flow ═══ */

function FlowPath({
  flow, a, b, alpha, animate,
}: { flow: FlowLink; a: PlanetNode; b: PlanetNode; alpha: number; animate: boolean }) {
  const geo = useMemo(() => flowGeometry(a, b, flow.crossSystem), [a, b, flow.crossSystem]);
  const done = flow.total > 0 && flow.released === flow.total;
  const stroke = flow.crossSystem ? SPACE.violet : done ? SPACE.teal : flow.color;
  const width = clamp(1.1 + flow.total * 0.55, 1.1, 4.2);

  return (
    <g opacity={alpha} style={{ transition: 'opacity .3s' }}>
      {/* 항로 글로우 */}
      <path d={geo.d} fill="none" stroke={withAlpha(stroke, 0.18)} strokeWidth={width * 4} strokeLinecap="round" />
      <path
        d={geo.d}
        fill="none"
        stroke={withAlpha(stroke, 0.85)}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={flow.crossSystem ? '9 8' : undefined}
      />
      <polygon points={geo.arrow} fill={withAlpha(stroke, 0.95)} />
      {animate && (
        <circle r={2.9} fill="#ffffff" opacity={0.9}>
          <animateMotion path={geo.d} dur={`${clamp(geo.length / 130, 3.4, 11)}s`} repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════ Planet ═══ */

function Planet({
  p, k, alpha, active, onEnter, onLeave, onSelect,
}: {
  p: PlanetNode; k: number; alpha: number; active: boolean;
  onEnter: () => void; onLeave: () => void; onSelect: () => void;
}) {
  const c = p.ip.color || SPACE.ice;
  const ringR = p.r + 11;
  const circ = 2 * Math.PI * ringR;
  const ringColor = p.counts.total === 0
    ? STATUS_COLOR.notSubmitted
    : p.progress >= 1 ? STATUS_COLOR.released
      : p.counts.inProgress ? STATUS_COLOR.inProgress : STATUS_COLOR.released;

  return (
    <g
      transform={`translate(${p.x},${p.y})`}
      opacity={alpha}
      style={{ transition: 'opacity .3s', cursor: 'pointer' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* 클릭 판정 여유 */}
      <circle r={p.r + 20} fill="transparent" />
      <circle r={p.r * 2.5} fill={`url(#wu-h-${p.id})`} opacity={active ? 1 : 0.62} />

      {/* Release 진척 링 */}
      <circle r={ringR} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={3} />
      {p.counts.total > 0 && (
        <circle
          r={ringR}
          fill="none"
          stroke={ringColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${circ * p.progress} ${circ}`}
          transform="rotate(-90)"
          style={{ transition: 'stroke-dasharray .5s' }}
        />
      )}

      {/* 행성 본체 */}
      <circle r={p.r} fill={`url(#wu-p-${p.id})`} />
      <circle r={p.r} fill="url(#wu-shade)" />
      <circle r={p.r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={0.9} />

      {/* 외부 부서로 나가는 산출물 = 작은 위성 */}
      {k > DETAIL_K && p.externalOut > 0 && (
        <g>
          {Array.from({ length: Math.min(3, p.externalOut) }, (_, i) => {
            const a = (i * 137 + 40) * (Math.PI / 180);
            const d = p.r + 20;
            return <circle key={i} cx={Math.cos(a) * d} cy={Math.sin(a) * d} r={2.6} fill={withAlpha(SPACE.ice, 0.8)} />;
          })}
        </g>
      )}

      {/* 선택 강조 링 */}
      {active && (
        <circle r={p.r + 22} fill="none" stroke={withAlpha(c, 0.85)} strokeWidth={1.2} strokeDasharray="4 6">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="14s" repeatCount="indefinite" />
        </circle>
      )}

      {k > LABEL_K && (
        <g transform={`translate(0, ${p.r + 12}) scale(${labelScale(k)})`}>
          <text
            y={16}
            textAnchor="middle"
            fill={SPACE.tx}
            fontFamily={FONT_MONO}
            fontSize={14}
            fontWeight={600}
            stroke="rgba(3,6,13,.85)"
            strokeWidth={3.4}
            paintOrder="stroke"
          >
            {p.ip.name}
          </text>
          {k > DETAIL_K && (
            <text
              y={31}
              textAnchor="middle"
              fill={SPACE.dm2}
              fontFamily={FONT_MONO}
              fontSize={10}
              stroke="rgba(3,6,13,.8)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {p.loading ? '···' : `${p.counts.released}/${p.counts.total}`}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════ Chrome ═══ */

function TopBar({
  projectName, projectCode, model, loading, onZoomIn, onZoomOut, onFit, onClose,
}: {
  projectName: string; projectCode: string; model: UniverseModel; loading: boolean;
  onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onClose: () => void;
}) {
  return (
    <Box
      sx={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px 13px 18px',
        background: 'linear-gradient(180deg, rgba(3,6,13,.92) 0%, rgba(3,6,13,.55) 62%, transparent 100%)',
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ pointerEvents: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: '-.01em' }}>
            Total Workflow
          </Box>
          <Box
            sx={{
              fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.16em', color: SPACE.teal,
              border: `1px solid ${withAlpha(SPACE.teal, 0.4)}`, borderRadius: '999px', padding: '2px 9px',
            }}
          >
            UNIVERSE
          </Box>
          {loading && (
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: SPACE.dm2 }} className="wu-anim"
              style={{ animation: 'wu-twinkle 1.4s ease-in-out infinite' }}>
              scanning…
            </Box>
          )}
        </Box>
        <Box sx={{ fontSize: 11.5, color: SPACE.dm2, mt: '2px', fontFamily: FONT_MONO }}>
          {projectCode} · {projectName}
        </Box>
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ display: 'flex', gap: '18px', pointerEvents: 'auto', mr: '4px' }}>
        <Stat label="SECTORS" value={model.systems.length} />
        <Stat label="PLANETS" value={model.planets.length} />
        <Stat label="ROUTES" value={model.flows.length} />
        <Stat label="RELEASED" value={`${model.counts.released}/${model.counts.total}`} tone={SPACE.teal} />
      </Box>

      <Box sx={{ display: 'flex', gap: '6px', pointerEvents: 'auto' }}>
        <GlassButton onClick={onZoomOut} title="Zoom out">−</GlassButton>
        <GlassButton onClick={onZoomIn} title="Zoom in">+</GlassButton>
        <GlassButton onClick={onFit} title="Fit all sectors"><Icon name="fit" size={13} /></GlassButton>
        <GlassButton onClick={onClose} title="Close (Esc)"><Icon name="x" size={14} /></GlassButton>
      </Box>
    </Box>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.16em', color: SPACE.dm2 }}>{label}</Box>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: tone ?? SPACE.tx }}>{value}</Box>
    </Box>
  );
}

function GlassButton({
  children, onClick, title, sx,
}: { children: React.ReactNode; onClick: () => void; title?: string; sx?: object }) {
  return (
    <Box
      component="button"
      title={title}
      onClick={onClick}
      sx={{
        display: 'inline-grid', placeItems: 'center', minWidth: 30, height: 30, padding: '0 8px',
        borderRadius: '9px', border: `1px solid ${SPACE.hair}`, background: SPACE.panel,
        color: SPACE.tx, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer',
        backdropFilter: 'blur(8px)', transition: '.15s',
        '&:hover': { borderColor: SPACE.hair2, background: 'rgba(20,30,54,.9)' },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function SectorRail({
  systems, active, totalIps, onAll, onPick,
}: {
  systems: SystemNode[]; active: string | null; totalIps: number;
  onAll: () => void; onPick: (s: SystemNode) => void;
}) {
  return (
    <Box
      sx={{
        position: 'absolute', top: 74, left: 14, bottom: 14, width: RAIL_W, zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: '8px',
        borderRadius: '14px', border: `1px solid ${SPACE.hair}`, background: SPACE.panel,
        backdropFilter: 'blur(12px)', padding: '12px 10px', overflow: 'hidden',
        animation: 'wu-rise .4s ease both',
      }}
    >
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.18em', color: SPACE.dm2, px: '4px' }}>
        SECTORS · DOMAIN
      </Box>

      <RailRow
        color={SPACE.ice}
        label="All sectors"
        sub={`${systems.length} domains · ${totalIps} IP`}
        on={active === null}
        onClick={onAll}
      />

      {/* MUI sx는 height 숫자값 0~1을 %로 해석한다 — 1px 구분선은 반드시 문자열로. */}
      <Box sx={{ height: '1px', background: SPACE.hair, my: '2px', flex: '0 0 auto' }} />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', pr: '2px' }}>
        {systems.map((s) => {
          const pct = s.counts.total ? Math.round((s.counts.released / s.counts.total) * 100) : 0;
          return (
            <RailRow
              key={s.key}
              color={s.color}
              label={s.key === UNASSIGNED_DOMAIN ? 'Unassigned' : s.key}
              sub={`${s.planets.length} IP · ${s.counts.released}/${s.counts.total} released`}
              pct={pct}
              on={active === s.key}
              onClick={() => onPick(s)}
            />
          );
        })}
      </Box>

      <Box sx={{ fontSize: 10, color: SPACE.dm2, lineHeight: 1.7, px: '4px', pt: '2px', borderTop: `1px solid ${SPACE.hair}` }}>
        드래그로 이동 · 휠로 확대<br />행성을 클릭하면 IP 상세
      </Box>
    </Box>
  );
}

function RailRow({
  color, label, sub, pct, on, onClick,
}: { color: string; label: string; sub: string; pct?: number; on: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        textAlign: 'left', width: '100%', border: '1px solid', borderRadius: '10px',
        padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', transition: '.15s',
        borderColor: on ? withAlpha(color, 0.55) : 'transparent',
        background: on ? withAlpha(color, 0.14) : 'transparent',
        '&:hover': { background: on ? withAlpha(color, 0.18) : 'rgba(255,255,255,.05)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Box
          sx={{
            width: 9, height: 9, borderRadius: '50%', background: color, flex: '0 0 auto',
            boxShadow: `0 0 10px ${withAlpha(color, 0.9)}`,
          }}
        />
        <Box
          sx={{
            fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: on ? SPACE.tx : SPACE.dm,
            letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      </Box>
      <Box sx={{ fontSize: 10, color: SPACE.dm2, mt: '3px', ml: '17px' }}>{sub}</Box>
      {pct !== undefined && (
        <Box sx={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,.09)', mt: '6px', ml: '17px', overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
        </Box>
      )}
    </Box>
  );
}

function FlowLegend({ flows }: { flows: FlowLink[] }) {
  const cross = flows.filter((f) => f.crossSystem).length;
  const items = [
    { c: STATUS_COLOR.released, t: 'Released' },
    { c: STATUS_COLOR.inProgress, t: 'In progress' },
    { c: STATUS_COLOR.notSubmitted, t: 'Not submitted' },
  ];
  return (
    <Box
      sx={{
        position: 'absolute', right: 14, bottom: 14, zIndex: 4,
        borderRadius: '12px', border: `1px solid ${SPACE.hair}`, background: SPACE.panel,
        backdropFilter: 'blur(10px)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px',
      }}
    >
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.18em', color: SPACE.dm2 }}>LEGEND</Box>
      <Box sx={{ display: 'flex', gap: '12px' }}>
        {items.map((i) => (
          <Box key={i.t} sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 10.5, color: SPACE.dm }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: i.c }} /> {i.t}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: '12px' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 10.5, color: SPACE.dm }}>
          <Box sx={{ width: 18, height: 2, background: SPACE.teal, borderRadius: 2 }} /> intra-domain
        </Box>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 10.5, color: SPACE.dm }}>
          <Box
            sx={{
              width: 18, height: 2, borderRadius: 2,
              backgroundImage: `repeating-linear-gradient(90deg, ${SPACE.violet} 0 5px, transparent 5px 9px)`,
            }}
          />
          cross-domain ({cross})
        </Box>
      </Box>
    </Box>
  );
}

function HoverCard({ planet, x, y, hostW }: { planet: PlanetNode; x: number; y: number; hostW: number }) {
  const flipped = x > hostW - 260;
  return (
    <Box
      sx={{
        position: 'absolute', zIndex: 6, pointerEvents: 'none',
        left: flipped ? undefined : x + 16, right: flipped ? hostW - x + 16 : undefined, top: y + 14,
        minWidth: 190, borderRadius: '11px', border: `1px solid ${SPACE.hair2}`,
        background: 'rgba(6,11,24,.94)', backdropFilter: 'blur(10px)', padding: '9px 11px',
        boxShadow: '0 18px 40px rgba(0,0,0,.55)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: planet.ip.color }} />
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>{planet.ip.name}</Box>
      </Box>
      <Box sx={{ fontSize: 10.5, color: SPACE.dm2, mt: '3px' }}>
        {planet.domain === UNASSIGNED_DOMAIN ? 'no domain' : planet.domain} · {planet.ip.description || '—'}
      </Box>
      <MiniBar counts={planet.counts} />
    </Box>
  );
}

function MiniBar({ counts }: { counts: PlanetNode['counts'] }) {
  const pct = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);
  return (
    <>
      <Box sx={{ display: 'flex', height: 5, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.1)', mt: '8px' }}>
        <Box sx={{ width: `${pct(counts.released)}%`, background: STATUS_COLOR.released }} />
        <Box sx={{ width: `${pct(counts.inProgress)}%`, background: STATUS_COLOR.inProgress }} />
      </Box>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: SPACE.dm2, mt: '5px' }}>
        {counts.released} released · {counts.inProgress} in progress · {counts.notSubmitted} pending
      </Box>
    </>
  );
}

function DetailPanel({
  planet, model, onClose, onOpenBoard, onHop,
}: {
  planet: PlanetNode; model: UniverseModel;
  onClose: () => void; onOpenBoard: () => void; onHop: (ipId: string) => void;
}) {
  const outgoing = model.flows.filter((f) => f.from === planet.id);
  const incoming = model.flows.filter((f) => f.to === planet.id);
  const owner = findDirectoryUser(planet.ip.owners[0]);

  return (
    <Box
      sx={{
        position: 'absolute', top: 74, right: 14, bottom: 92, width: PANEL_W, zIndex: 5,
        borderRadius: '14px', border: `1px solid ${SPACE.hair}`, background: SPACE.panel,
        backdropFilter: 'blur(14px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'wu-slide .3s ease both',
      }}
    >
      <Box sx={{ padding: '13px 14px 11px', borderBottom: `1px solid ${SPACE.hair}` }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
          <Box
            sx={{
              width: 26, height: 26, borderRadius: '50%', flex: '0 0 auto', mt: '1px',
              background: `radial-gradient(circle at 32% 28%, ${lighten(planet.ip.color, 0.5)}, ${planet.ip.color} 55%, ${darken(planet.ip.color, 0.5)})`,
              boxShadow: `0 0 16px ${withAlpha(planet.ip.color, 0.7)}`,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 14.5, fontWeight: 700 }}>{planet.ip.name}</Box>
            <Box sx={{ fontSize: 11, color: SPACE.dm2, mt: '2px' }}>{planet.ip.description || '—'}</Box>
          </Box>
          <GlassButton onClick={onClose} title="Close panel"><Icon name="x" size={13} /></GlassButton>
        </Box>
        <Box sx={{ display: 'flex', gap: '6px', mt: '10px', flexWrap: 'wrap' }}>
          <Tag color={SPACE.ice}>{planet.domain === UNASSIGNED_DOMAIN ? 'NO DOMAIN' : planet.domain}</Tag>
          <Tag color={SPACE.violet}>{owner.name}</Tag>
          <Tag color={planet.ip.myAccess === 'edit' ? SPACE.teal : SPACE.dm2}>{planet.ip.myAccess.toUpperCase()}</Tag>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', padding: '12px 14px 16px' }}>
        <SectionLabel>Deliverables</SectionLabel>
        <MiniBar counts={planet.counts} />
        {planet.externalOut > 0 && (
          <Box sx={{ fontSize: 10.5, color: SPACE.dm2, mt: '8px' }}>
            {planet.externalOut}건은 다른 부서(외부)로 나갑니다 — 위성 점으로 표시됩니다.
          </Box>
        )}

        <SectionLabel sx={{ mt: '18px' }}>Outgoing routes ({outgoing.length})</SectionLabel>
        <RouteList flows={outgoing} model={model} side="to" onHop={onHop} />

        <SectionLabel sx={{ mt: '16px' }}>Incoming routes ({incoming.length})</SectionLabel>
        <RouteList flows={incoming} model={model} side="from" onHop={onHop} />
      </Box>

      <Box sx={{ padding: '11px 14px', borderTop: `1px solid ${SPACE.hair}` }}>
        <Box
          component="button"
          onClick={onOpenBoard}
          sx={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            padding: '9px', borderRadius: '9px', border: `1px solid ${withAlpha(SPACE.teal, 0.5)}`,
            background: withAlpha(SPACE.teal, 0.16), color: SPACE.teal, fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: '.15s',
            '&:hover': { background: withAlpha(SPACE.teal, 0.26) },
          }}
        >
          <Icon name="expand" size={12} /> Open IP board
        </Box>
      </Box>
    </Box>
  );
}

function RouteList({
  flows, model, side, onHop,
}: { flows: FlowLink[]; model: UniverseModel; side: 'to' | 'from'; onHop: (id: string) => void }) {
  if (!flows.length) {
    return <Box sx={{ fontSize: 11, color: SPACE.dm2, mt: '6px' }}>없음</Box>;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px', mt: '7px' }}>
      {flows.map((f) => {
        const otherId = side === 'to' ? f.to : f.from;
        const other = model.planetById.get(otherId);
        if (!other) return null;
        return (
          <Box
            key={f.id}
            component="button"
            onClick={() => onHop(otherId)}
            title={f.names.join('\n')}
            sx={{
              textAlign: 'left', border: `1px solid ${SPACE.hair}`, borderRadius: '9px', padding: '7px 9px',
              background: 'rgba(255,255,255,.03)', cursor: 'pointer', fontFamily: 'inherit', transition: '.15s',
              '&:hover': { background: 'rgba(255,255,255,.08)', borderColor: SPACE.hair2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Box sx={{ fontSize: 10, color: SPACE.dm2, fontFamily: FONT_MONO }}>{side === 'to' ? '→' : '←'}</Box>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: other.ip.color }} />
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, color: SPACE.tx, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {other.ip.name}
              </Box>
              {f.crossSystem && <Tag color={SPACE.violet}>{other.domain}</Tag>}
            </Box>
            <Box sx={{ fontSize: 10, color: SPACE.dm2, mt: '4px', ml: '22px' }}>
              {f.released}/{f.total} released · {f.names.slice(0, 2).join(', ')}{f.names.length > 2 ? ` +${f.names.length - 2}` : ''}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function SectionLabel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.18em', color: SPACE.dm2, ...sx }}>
      {children}
    </Box>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.1em', padding: '2px 7px', borderRadius: '999px',
        border: `1px solid ${withAlpha(color, 0.45)}`, background: withAlpha(color, 0.13), color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

/** 도메인 이름을 SVG id로 쓸 수 있게 정리 (공백/기호 → '-'). */
function cssId(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '-');
}
