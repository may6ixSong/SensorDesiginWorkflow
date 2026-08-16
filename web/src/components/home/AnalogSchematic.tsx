import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Full-bleed circuit-board *illustration* used as the back-most layer of the
 * Home hero — the decorative "PCB blueprint" motif common to tech marketing
 * pages, not an electrically-accurate schematic. Long buses run the width and
 * height of the stage; shorter branch traces break off them at chamfered 45°
 * corners and end in pads or small chip footprints; a few buses carry a
 * dashed accent that flows, so the board reads as live rather than printed.
 *
 * ## Why this draws in real pixels
 * The obvious approach — a `0 0 100 100` viewBox with
 * `preserveAspectRatio="none"` — stretches x and y by different factors on
 * every window size, which was warping the artwork and forcing
 * `vectorEffect="non-scaling-stroke"` everywhere just to keep strokes even.
 * Instead the element is measured with `ResizeObserver` and the viewBox is set
 * to its actual pixel size, so one user unit is one CSS pixel everywhere:
 * circles stay round, corners stay square, and nothing needs correcting.
 *
 * The payoff is resolution independence. {@link PITCH} is a *pixel* grid
 * pitch, and the row/column counts are derived from the measured size, so a
 * laptop and a 4K panel both get traces at the same physical density — the
 * board gains detail on a bigger screen instead of being stretched and
 * blurred. The whole thing regenerates (from the same seed) when the measured
 * size changes.
 *
 * ## Masking
 * Traces are drawn first as one layer, then pads/chips on top. Chip
 * footprints paint a `bg`-filled body before their outline, punching the
 * trace out from underneath so leads appear to terminate at the chip rather
 * than running through it. `bg` must therefore be the stage's opaque
 * background colour.
 */

export interface SchematicPalette {
  /** Stage background — chip footprints use it to mask traces running under them. */
  bg: string;
  /** Ordinary branch traces. */
  line: string;
  /** Buses, drawn a little stronger than branch traces. */
  rail: string;
  /** Chip footprints and inline part marks. */
  comp: string;
  /** Pads and vias. */
  node: string;
  /** The animated signal riding on top of selected buses. */
  active: string;
}

/* ── board metrics, all in CSS pixels ───────────────────────────────────── */

/** Routing grid pitch. Fixed in px, so trace density matches on any monitor. */
const PITCH = 34;
/** Every Nth grid row carries a full-width bus. */
const H_BUS_EVERY = 3;
/** Every Nth grid column carries a full-height bus. */
const V_BUS_EVERY = 6;
/** Corner cut length that gives traces their chamfered PCB look. */
const CHAMFER = 8;
/** Board is not drawn until the element has been measured at least this big. */
const MIN_SIZE = 40;

/* ── model ──────────────────────────────────────────────────────────────── */

interface Pt { x: number; y: number }
interface Trace { d: string; k: string; bus?: boolean }
interface Pad { x: number; y: number; ring: boolean; k: string }
interface Chip { x: number; y: number; w: number; h: number; pins: number; k: string }
/** A short inline mark on a bus — decorative stand-in for a part, not a real symbol. */
interface Mark { x: number; y: number; horiz: boolean; wide: boolean; k: string }

/** Seeded PRNG (Park–Miller) so the board is stable across re-renders. */
function makeRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Orthogonal waypoints → a path with 45°-cut corners, which is what makes a
 * run of traces read as a circuit board rather than a plain grid.
 */
function tracePath(pts: Pt[], cut = CHAMFER): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    if (la === 0 || lb === 0) continue;
    const r = Math.min(cut, la / 2, lb / 2);
    const ax = (p.x - a.x) / la;
    const ay = (p.y - a.y) / la;
    const bx = (b.x - p.x) / lb;
    const by = (b.y - p.y) / lb;
    d += ` L ${p.x - ax * r} ${p.y - ay * r} L ${p.x + bx * r} ${p.y + by * r}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function buildBoard(seed: number, w: number, h: number) {
  const rand = makeRng(seed);
  const traces: Trace[] = [];
  const pads: Pad[] = [];
  const chips: Chip[] = [];
  const marks: Mark[] = [];
  /** Bus geometry re-drawn on top as the flowing signal. */
  const signal: string[] = [];
  let id = 0;

  const T = (d: string, bus = false) => traces.push({ d, bus, k: `t${id++}` });
  const D = (x: number, y: number, ring = false) => pads.push({ x, y, ring, k: `d${id++}` });

  const cols = Math.max(6, Math.round(w / PITCH));
  const rows = Math.max(5, Math.round(h / PITCH));
  const cw = w / cols;
  const ch = h / rows;
  /** Grid coordinates, offset half a cell so nothing sits flush on the edge. */
  const gx = (c: number) => Math.round((c + 0.5) * cw);
  const gy = (r: number) => Math.round((r + 0.5) * ch);

  const busRows: number[] = [];
  for (let r = 1; r < rows; r += H_BUS_EVERY) busRows.push(r);
  const busCols: number[] = [];
  for (let c = 2; c < cols; c += V_BUS_EVERY) busCols.push(c);

  /* full-span buses */
  busRows.forEach((r) => {
    const d = `M 0 ${gy(r)} H ${w}`;
    T(d, true);
    if (rand() < 0.4) signal.push(d);
  });
  busCols.forEach((c) => {
    const d = `M ${gx(c)} 0 V ${h}`;
    T(d, true);
    if (rand() < 0.25) signal.push(d);
  });

  /* pads where buses cross */
  busRows.forEach((r) =>
    busCols.forEach((c) => {
      if (rand() < 0.6) D(gx(c), gy(r), rand() < 0.3);
    }),
  );

  /* branch traces breaking off the horizontal buses, ending in a pad */
  busRows.forEach((r) => {
    for (let c = 1; c < cols - 1; c += 1) {
      if (rand() < 0.68) continue;
      const dir = rand() < 0.5 ? -1 : 1;
      const v1 = 1 + Math.floor(rand() * 2);
      const pts: Pt[] = [{ x: gx(c), y: gy(r) }, { x: gx(c), y: gy(r + dir * v1) }];
      if (rand() < 0.75) {
        const hdir = rand() < 0.5 ? -1 : 1;
        const hlen = 1 + Math.floor(rand() * 3);
        const c2 = Math.min(cols - 1, Math.max(0, c + hdir * hlen));
        pts.push({ x: gx(c2), y: gy(r + dir * v1) });
        if (rand() < 0.4) {
          const v2 = 1 + Math.floor(rand() * 2);
          pts.push({ x: gx(c2), y: gy(r + dir * (v1 + v2)) });
        }
      }
      T(tracePath(pts));
      const end = pts[pts.length - 1];
      D(end.x, end.y, rand() < 0.35);
      D(gx(c), gy(r));
    }
  });

  /* short parallel companion traces beside a bus — the "ribbon" look */
  busRows.forEach((r) => {
    for (let n = 0; n < 2; n++) {
      if (rand() < 0.45) continue;
      const c0 = Math.floor(rand() * Math.max(1, cols - 7));
      const len = 3 + Math.floor(rand() * 6);
      const off = (rand() < 0.5 ? -1 : 1) * ch * 0.36;
      const y = gy(r) + off;
      T(tracePath([
        { x: gx(c0), y: gy(r) },
        { x: gx(c0) + cw * 0.5, y },
        { x: gx(c0 + len), y },
        { x: gx(c0 + len) + cw * 0.5, y: gy(r) },
      ]));
    }
  });

  /* IC footprints — a rounded body with pin ticks each side, sitting near a bus */
  const chipCount = Math.max(3, Math.round((cols * rows) / 200));
  for (let n = 0; n < chipCount; n++) {
    const r = busRows[Math.floor(rand() * busRows.length)] + (rand() < 0.5 ? 2 : -2);
    const c = 1 + Math.floor(rand() * Math.max(1, cols - 5));
    if (r < 1 || r > rows - 2) continue;
    const cwid = (2 + Math.floor(rand() * 2)) * cw;
    const chgt = 1.5 * ch;
    const cx = gx(c) - cwid / 2;
    const cy = gy(r) - chgt / 2;
    chips.push({ x: cx, y: cy, w: cwid, h: chgt, pins: 3 + Math.floor(rand() * 3), k: `c${id++}` });
    /* lead up to the nearest bus */
    const busY = gy(busRows.reduce((best, br) => (Math.abs(gy(br) - cy) < Math.abs(gy(best) - cy) ? br : best)));
    T(`M ${cx + cwid / 2} ${cy < busY ? cy : cy + chgt} V ${busY}`);
    D(cx + cwid / 2, busY);
  }

  /* short inline marks along the buses — decorative, not real part symbols */
  busRows.forEach((r) => {
    for (let c = 1; c < cols - 1; c += 2) {
      if (rand() < 0.62) continue;
      marks.push({ x: gx(c) + cw / 2, y: gy(r), horiz: true, wide: rand() < 0.4, k: `m${id++}` });
    }
  });
  busCols.forEach((c) => {
    for (let r = 1; r < rows - 1; r += 2) {
      if (rand() < 0.72) continue;
      marks.push({ x: gx(c), y: gy(r) + ch / 2, horiz: false, wide: rand() < 0.4, k: `m${id++}` });
    }
  });

  /* short stub legs dropping off a bus and terminating in a pad, filling
     otherwise-empty rows between buses */
  for (let r = 0; r < rows; r++) {
    if (busRows.includes(r)) continue;
    for (let c = 1; c < cols - 1; c += 2) {
      if (rand() < 0.82) continue;
      const len = 1 + Math.floor(rand() * 2);
      const dir = rand() < 0.5 ? -1 : 1;
      const y2 = gy(Math.max(0, Math.min(rows - 1, r + dir * len)));
      T(`M ${gx(c)} ${gy(r)} V ${y2}`);
      D(gx(c), gy(r));
      D(gx(c), y2, rand() < 0.25);
    }
  }

  return { traces, pads, chips, marks, signal };
}

/* ── measurement ────────────────────────────────────────────────────────── */

/**
 * Rendered pixel size of the element, quantised so a drag-resize does not
 * rebuild the board on every animation frame.
 */
function useSize(ref: React.RefObject<SVGSVGElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number, h: number) =>
      setSize((prev) => {
        const nw = Math.round(w / 20) * 20;
        const nh = Math.round(h / 20) * 20;
        return prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh };
      });
    if (typeof ResizeObserver === 'undefined') {
      const r = el.getBoundingClientRect();
      read(r.width, r.height);
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      read(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* ── component ──────────────────────────────────────────────────────────── */

export function AnalogSchematic({ pal, seed = 11 }: { pal: SchematicPalette; seed?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const { w, h } = useSize(ref);
  const ready = w >= MIN_SIZE && h >= MIN_SIZE;
  const board = useMemo(() => (ready ? buildBoard(seed, w, h) : null), [seed, w, h, ready]);

  return (
    <svg
      ref={ref}
      viewBox={ready ? `0 0 ${w} ${h}` : undefined}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden
    >
      {board && (
        <>
          {/* traces */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {board.traces.map((t) => (
              <path key={t.k} d={t.d} stroke={t.bus ? pal.rail : pal.line} strokeWidth={t.bus ? 1.3 : 1} />
            ))}
          </g>

          {/* signal riding selected buses — same geometry, dashed and flowing */}
          {board.signal.map((d, i) => (
            <path
              key={`sig${i}`}
              d={d}
              fill="none"
              stroke={pal.active}
              strokeWidth={1.6}
              strokeDasharray="28 46"
              strokeLinecap="round"
              style={{ animation: `flowdash ${12 + i * 1.8}s linear infinite` }}
            />
          ))}

          {/* IC footprints */}
          <g fill="none" stroke={pal.comp} strokeWidth={1} strokeLinecap="round">
            {board.chips.map((c) => (
              <g key={c.k}>
                <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={3} fill={pal.bg} />
                {Array.from({ length: c.pins }, (_, i) => {
                  const py = c.y + ((i + 1) * c.h) / (c.pins + 1);
                  return (
                    <g key={i}>
                      <line x1={c.x - 7} y1={py} x2={c.x} y2={py} />
                      <line x1={c.x + c.w} y1={py} x2={c.x + c.w + 7} y2={py} />
                    </g>
                  );
                })}
              </g>
            ))}
          </g>

          {/* inline marks — a plain gap-in-the-line rectangle, purely decorative */}
          <g fill={pal.bg} stroke={pal.comp} strokeWidth={1}>
            {board.marks.map((m) => {
              const len = m.wide ? 13 : 8;
              const wid = 6;
              const rw = m.horiz ? len : wid;
              const rh = m.horiz ? wid : len;
              return <rect key={m.k} x={m.x - rw / 2} y={m.y - rh / 2} width={rw} height={rh} rx={1.5} />;
            })}
          </g>

          {/* pads and vias — a few breathe so the board reads as live */}
          {board.pads.map((p, i) =>
            p.ring ? (
              <circle key={p.k} cx={p.x} cy={p.y} r={3.4} fill="none" stroke={pal.node} strokeWidth={1.3}>
                {i % 5 === 0 && (
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur={`${4 + (i % 7) * 0.55}s`}
                    begin={`${(i % 11) * 0.32}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            ) : (
              <circle key={p.k} cx={p.x} cy={p.y} r={2.1} fill={pal.node}>
                {i % 5 === 0 && (
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur={`${4 + (i % 7) * 0.55}s`}
                    begin={`${(i % 11) * 0.32}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            ),
          )}
        </>
      )}
    </svg>
  );
}
