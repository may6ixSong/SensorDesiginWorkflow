import { useMemo } from 'react';

/**
 * Full-bleed circuit-board *illustration* used as the back-most layer of the
 * Home hero — the decorative "PCB blueprint" motif common to tech marketing
 * pages, not an electrically-accurate schematic. Long buses run the width and
 * height of a fixed reference canvas; shorter branch traces break off them at
 * chamfered 45° corners into pads, chip footprints, and part symbols (R, C, L,
 * diode, op-amp, MOSFET, MUX, inverter).
 *
 * ## Why this bakes to a static image instead of live SVG
 * An earlier version measured the container with `ResizeObserver` and rebuilt
 * several hundred DOM nodes — plus restarted every SMIL `<animate>` — on every
 * resize tick, which is what made window drag-resize stutter. The fix is the
 * same one any hero background photo uses: draw the heavy artwork **once**
 * into an SVG string at a fixed reference size, hand it to the browser as a
 * `background-image` data URI, and let `background-size: cover` do the
 * scaling. Because it is still vector markup (not a rasterized PNG), the
 * browser's own image compositor keeps it crisp at any window size or pixel
 * density — cover-scaling costs nothing on the React/layout side, so resize
 * is back to being just CSS.
 *
 * Only a handful of elements stay live: a few buses redrawn on top with a
 * flowing dashed stroke, and a sampled subset of pads that pulse. That
 * overlay uses `viewBox` + `preserveAspectRatio="xMidYMid slice"` at the same
 * reference size, which reproduces `background-size: cover` for an SVG
 * element, so it lines up with the baked image at any aspect ratio without
 * needing to know the container's actual pixel size either.
 *
 * The board is rebuilt only when `seed` or the resolved theme colours change
 * (i.e. on mount and on light/dark toggle) — never on resize.
 *
 * ## Masking
 * Chip and part footprints paint a `bg`-filled body before their outline,
 * punching the trace out from underneath so leads appear to terminate at the
 * part rather than running through it. `bg` must therefore be the stage's
 * opaque background colour.
 */

export interface SchematicPalette {
  /** Stage background — part/chip footprints mask traces running under them. */
  bg: string;
  /** Ordinary branch traces. */
  line: string;
  /** Buses, drawn a little stronger than branch traces. */
  rail: string;
  /** Part outlines, chip footprints, pin leads. */
  comp: string;
  /** Pads and vias. */
  node: string;
  /** The animated signal riding on top of selected buses. */
  active: string;
}

/* ── reference canvas — a fixed coordinate system, independent of the
   viewer's actual window size. See file header for why. ────────────────── */

const REF_W = 2400;
const REF_H = 1350;
/** Routing grid pitch, in reference units. */
const PITCH = 42;
/** Every Nth grid row carries a full-width bus. */
const H_BUS_EVERY = 4;
/** Every Nth grid column carries a full-height bus. */
const V_BUS_EVERY = 7;
/** Corner cut length that gives traces their chamfered PCB look. */
const CHAMFER = 7;
/** Uniform stroke width for every trace/outline, in reference units. */
const SW = 1.9;

/* ── model ──────────────────────────────────────────────────────────────── */

type PartKind = 'R' | 'C' | 'L' | 'D' | 'AMP' | 'MOSFET' | 'MUX' | 'INV';

interface Pt { x: number; y: number }
interface Trace { d: string; bus?: boolean }
interface Pad { x: number; y: number; ring: boolean }
interface Chip { x: number; y: number; w: number; h: number; pins: number }
interface Part { kind: PartKind; x: number; y: number; rot: number }

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

function buildBoard(seed: number) {
  const rand = makeRng(seed);
  const traces: Trace[] = [];
  const pads: Pad[] = [];
  const chips: Chip[] = [];
  const parts: Part[] = [];
  /** Bus geometry re-drawn on top as the flowing signal. */
  const signal: string[] = [];

  const T = (d: string, bus = false) => traces.push({ d, bus });
  const D = (x: number, y: number, ring = false) => pads.push({ x, y, ring });

  const cols = Math.round(REF_W / PITCH);
  const rows = Math.round(REF_H / PITCH);
  const cw = REF_W / cols;
  const ch = REF_H / rows;
  /** Grid coordinates, offset half a cell so nothing sits flush on the edge. */
  const gx = (c: number) => Math.round((c + 0.5) * cw);
  const gy = (r: number) => Math.round((r + 0.5) * ch);

  const busRows: number[] = [];
  for (let r = 1; r < rows; r += H_BUS_EVERY) busRows.push(r);
  const busCols: number[] = [];
  for (let c = 2; c < cols; c += V_BUS_EVERY) busCols.push(c);

  /* full-span buses */
  busRows.forEach((r) => {
    const d = `M 0 ${gy(r)} H ${REF_W}`;
    T(d, true);
    if (rand() < 0.4) signal.push(d);
  });
  busCols.forEach((c) => {
    const d = `M ${gx(c)} 0 V ${REF_H}`;
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
      if (rand() < 0.65) continue;
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
    for (let n = 0; n < 3; n++) {
      if (rand() < 0.55) continue;
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
  const chipCount = Math.max(6, Math.round((cols * rows) / 150));
  for (let n = 0; n < chipCount; n++) {
    const r = busRows[Math.floor(rand() * busRows.length)] + (rand() < 0.5 ? 2 : -2);
    const c = 1 + Math.floor(rand() * Math.max(1, cols - 5));
    if (r < 1 || r > rows - 2) continue;
    const cwid = (2 + Math.floor(rand() * 2)) * cw;
    const chgt = 1.5 * ch;
    const cx = gx(c) - cwid / 2;
    const cy = gy(r) - chgt / 2;
    chips.push({ x: cx, y: cy, w: cwid, h: chgt, pins: 3 + Math.floor(rand() * 3) });
    /* lead up to the nearest bus */
    const busY = gy(busRows.reduce((best, br) => (Math.abs(gy(br) - cy) < Math.abs(gy(best) - cy) ? br : best)));
    T(`M ${cx + cwid / 2} ${cy < busY ? cy : cy + chgt} V ${busY}`);
    D(cx + cwid / 2, busY);
  }

  /** Weighted pick among the small decorative part symbols. */
  const pickKind = (): PartKind => {
    const r = rand();
    if (r < 0.27) return 'R';
    if (r < 0.46) return 'C';
    if (r < 0.56) return 'L';
    if (r < 0.66) return 'D';
    if (r < 0.79) return 'MOSFET';
    if (r < 0.9) return 'MUX';
    if (r < 0.97) return 'INV';
    return 'AMP';
  };

  /* inline parts along the buses — real component symbols, not blank marks */
  busRows.forEach((r) => {
    for (let c = 1; c < cols - 1; c += 2) {
      if (rand() < 0.55) continue;
      parts.push({ kind: pickKind(), x: gx(c) + cw / 2, y: gy(r), rot: 0 });
    }
  });
  busCols.forEach((c) => {
    for (let r = 1; r < rows - 1; r += 2) {
      if (rand() < 0.65) continue;
      parts.push({ kind: pickKind(), x: gx(c), y: gy(r) + ch / 2, rot: 90 });
    }
  });

  /* short stub legs dropping off a bus and terminating in a pad, filling
     otherwise-empty rows between buses */
  for (let r = 0; r < rows; r++) {
    if (busRows.includes(r)) continue;
    for (let c = 1; c < cols - 1; c += 2) {
      if (rand() < 0.85) continue;
      const len = 1 + Math.floor(rand() * 2);
      const dir = rand() < 0.5 ? -1 : 1;
      const y2 = gy(Math.max(0, Math.min(rows - 1, r + dir * len)));
      T(`M ${gx(c)} ${gy(r)} V ${y2}`);
      D(gx(c), gy(r));
      D(gx(c), y2, rand() < 0.25);
    }
  }

  return { traces, pads, chips, parts, signal };
}

/* ── part symbols, authored in local px around the origin, wrapped in a
   translate(+rotate) group by the caller. `bg`-filled shapes mask the trace
   running underneath so leads read as terminating at the part. ──────────── */

function partSvg(p: Part, comp: string, bg: string): string {
  const g = (inner: string) =>
    `<g transform="translate(${p.x} ${p.y}) rotate(${p.rot})" stroke="${comp}" stroke-width="${SW}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

  switch (p.kind) {
    case 'R':
      return g(`<rect x="-13" y="-5" width="26" height="10" fill="${bg}"/>`);
    case 'C':
      return g(
        `<rect x="-5" y="-13" width="10" height="26" fill="${bg}" stroke="none"/>` +
        `<line x1="-3.4" y1="-11" x2="-3.4" y2="11"/>` +
        `<line x1="3.4" y1="-11" x2="3.4" y2="11"/>`,
      );
    case 'L':
      return g(
        `<rect x="-17" y="-12" width="34" height="13" fill="${bg}" stroke="none"/>` +
        `<path d="M -16.8 0 A 5.6 7.2 0 0 1 -5.6 0 A 5.6 7.2 0 0 1 5.6 0 A 5.6 7.2 0 0 1 16.8 0"/>`,
      );
    case 'D':
      return g(
        `<rect x="-8" y="-11" width="16" height="22" fill="${bg}" stroke="none"/>` +
        `<path d="M -6 -9 L 5 0 L -6 9 Z" fill="${bg}"/>` +
        `<line x1="5" y1="-10" x2="5" y2="10"/>`,
      );
    case 'AMP':
      return g(
        `<rect x="-42" y="-4" width="70" height="8" fill="${bg}" stroke="none"/>` +
        `<path d="M -23 -25 L 23 0 L -23 25 Z" fill="${bg}"/>` +
        // spine jogs up into the inverting input, feedback resistor above
        `<path d="M -42 0 V -12.5 H -23"/>` +
        `<path d="M 23 0 V -12.5 H -6"/>` +
        `<rect x="-19" y="-16.5" width="26" height="8" fill="${bg}"/>` +
        // non-inverting input drops to its own ground
        `<path d="M -23 12.5 H -34 V 32"/>` +
        `<line x1="-45" y1="32" x2="-23" y2="32"/>` +
        `<line x1="-40" y1="38" x2="-28" y2="38"/>` +
        `<line x1="-36" y1="44" x2="-32" y2="44"/>` +
        // − / + pin marks
        `<line x1="-19" y1="-12.5" x2="-11" y2="-12.5"/>` +
        `<line x1="-19" y1="12.5" x2="-11" y2="12.5"/>` +
        `<line x1="-15" y1="8" x2="-15" y2="17"/>`,
      );
    case 'MOSFET':
      // vertical enhancement MOSFET: gate plate at left, broken channel + spine
      // at right, drain/source leads top and bottom, source arrow into the gate.
      return g(
        `<rect x="-30" y="-30" width="52" height="60" fill="${bg}" stroke="none"/>` +
        `<line x1="-24" y1="0" x2="-13" y2="0"/>` +
        `<line x1="-13" y1="-13" x2="-13" y2="13"/>` +
        `<line x1="-4" y1="-19" x2="10" y2="-19"/>` +
        `<line x1="-4" y1="0" x2="10" y2="0"/>` +
        `<line x1="-4" y1="19" x2="10" y2="19"/>` +
        `<line x1="10" y1="-19" x2="10" y2="19"/>` +
        `<line x1="10" y1="-19" x2="10" y2="-27"/>` +
        `<line x1="10" y1="19" x2="10" y2="27"/>` +
        `<path d="M 10 12 L 5 6 M 10 12 L 15 8" />`,
      );
    case 'MUX':
      // trapezoid body: wide input edge on the left, narrow output edge on the
      // right, two input stubs, one output stub, one select stub from below.
      return g(
        `<rect x="-40" y="-28" width="66" height="56" fill="${bg}" stroke="none"/>` +
        `<path d="M -22 -24 L -22 24 L 20 9 L 20 -9 Z" fill="${bg}"/>` +
        `<line x1="-38" y1="-12" x2="-22" y2="-12"/>` +
        `<line x1="-38" y1="12" x2="-22" y2="12"/>` +
        `<line x1="20" y1="0" x2="36" y2="0"/>` +
        `<line x1="-1" y1="16.5" x2="-1" y2="30"/>`,
      );
    case 'INV':
      // triangle + bubble inverter, with input/output leads.
      return g(
        `<rect x="-30" y="-16" width="56" height="32" fill="${bg}" stroke="none"/>` +
        `<path d="M -15 -14 L -15 14 L 13 0 Z" fill="${bg}"/>` +
        `<circle cx="17.5" cy="0" r="4.5" fill="${bg}"/>` +
        `<line x1="-27" y1="0" x2="-15" y2="0"/>` +
        `<line x1="22" y1="0" x2="30" y2="0"/>`,
      );
    default:
      return '';
  }
}

/** IC footprint markup — a rounded body with pin ticks either side. */
function chipSvg(c: Chip, comp: string, bg: string): string {
  const pins = Array.from({ length: c.pins }, (_, i) => {
    const py = c.y + ((i + 1) * c.h) / (c.pins + 1);
    return `<line x1="${c.x - 8}" y1="${py}" x2="${c.x}" y2="${py}"/><line x1="${c.x + c.w}" y1="${py}" x2="${c.x + c.w + 8}" y2="${py}"/>`;
  }).join('');
  return (
    `<g stroke="${comp}" stroke-width="${SW}" fill="none" stroke-linecap="round">` +
    `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="4" fill="${bg}"/>${pins}</g>`
  );
}

/** Static board markup — everything except the live-animated overlay. */
function boardSvgMarkup(board: ReturnType<typeof buildBoard>, pal: SchematicPalette): string {
  const traceEls = board.traces
    .map((t) => `<path d="${t.d}" stroke="${t.bus ? pal.rail : pal.line}" stroke-width="${t.bus ? SW * 1.25 : SW}"/>`)
    .join('');
  const chipEls = board.chips.map((c) => chipSvg(c, pal.comp, pal.bg)).join('');
  const partEls = board.parts.map((p) => partSvg(p, pal.comp, pal.bg)).join('');
  const padEls = board.pads
    .map((p) =>
      p.ring
        ? `<circle cx="${p.x}" cy="${p.y}" r="4.6" fill="none" stroke="${pal.node}" stroke-width="${SW * 1.1}"/>`
        : `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${pal.node}"/>`,
    )
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REF_W} ${REF_H}">` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${traceEls}</g>` +
    chipEls +
    partEls +
    padEls +
    `</svg>`
  );
}

function toDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ── component ──────────────────────────────────────────────────────────── */

export function AnalogSchematic({ pal, seed = 11 }: { pal: SchematicPalette; seed?: number }) {
  const board = useMemo(() => buildBoard(seed), [seed]);
  const bgUrl = useMemo(() => toDataUrl(boardSvgMarkup(board, pal)), [board, pal]);

  /** Small subset of pads that stay live and pulse, layered over the baked image. */
  const breathingPads = useMemo(
    () => board.pads.filter((_, i) => i % 6 === 0).slice(0, 40),
    [board],
  );

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
      {/* the heavy artwork — baked once, scaled like a photo background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${bgUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* thin live overlay: flowing signal + a few pulsing pads, aligned to the
          baked image via the same reference viewBox and "slice" (== cover) fit */}
      <svg
        viewBox={`0 0 ${REF_W} ${REF_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {board.signal.map((d, i) => (
          <path
            key={`sig${i}`}
            d={d}
            fill="none"
            stroke={pal.active}
            strokeWidth={SW * 1.3}
            strokeDasharray="28 46"
            strokeLinecap="round"
            style={{ animation: `flowdash ${12 + i * 1.8}s linear infinite` }}
          />
        ))}
        {breathingPads.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.ring ? 4.6 : 3} fill={pal.node}>
            <animate
              attributeName="opacity"
              values="0.35;1;0.35"
              dur={`${4 + (i % 7) * 0.55}s`}
              begin={`${(i % 11) * 0.32}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}
