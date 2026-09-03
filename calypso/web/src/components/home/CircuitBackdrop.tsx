import { memo } from 'react';

/**
 * Home hero background — one deliberately sparse chip/PCB illustration.
 *
 * ## Why it is hand-authored and static
 * The previous version generated a full-bleed board procedurally on a ~27px
 * routing grid: thousands of traces, pads and part symbols, plus a live SMIL
 * overlay of flowing signals and pulsing pads. It was visually oppressive
 * (no negative space anywhere) and it cost real frames — a multi-hundred-KB
 * data URI to decode plus dozens of independent animation timelines running
 * forever behind the hero.
 *
 * This version is the opposite trade: a fixed composition of four chips, a
 * handful of routed traces, a few part symbols and ~30 pads, laid out by hand
 * so the busy areas and the empty areas are both intentional. The wordmark's
 * center, and the corners where the floating service cards sit, are left open.
 *
 * ## Cost
 * The markup is built **once per palette** (i.e. once per theme, ever — the
 * cache below is module scope, so it survives unmount and theme flip-flops)
 * and handed to the browser as a `background-image` data URI. From then on it
 * is an image like any other: no SVG DOM, no animation, no work on re-render,
 * and `background-size: cover` handles resize entirely on the compositor.
 *
 * ## Masking
 * Chip bodies and part symbols paint a `bg`-filled shape before their outline,
 * so traces terminate at the part instead of running through it. `bg` must
 * therefore be the stage's own opaque background colour.
 */

export interface CircuitPalette {
  /** Stage background — chip/part bodies fill with this to mask traces beneath. */
  bg: string;
  /** Ordinary routed traces. */
  trace: string;
  /** The two main runs between chips, drawn slightly heavier. */
  traceStrong: string;
  /** Chip outlines, pins, part symbols. */
  outline: string;
  /** Pads and vias. */
  node: string;
  /** Sparse highlights — pin-1 dots, die outline, a couple of test points. */
  accent: string;
  /** Silkscreen reference designators (U1, U2 …). */
  label: string;
}

/* ── reference canvas ───────────────────────────────────────────────────── */

const REF_W = 1600;
const REF_H = 900;
/** Uniform stroke width for traces and outlines, in reference units. */
const SW = 2.2;
/** How far pin leads stick out of a chip body. */
const PIN_LEN = 14;
/** Corner cut that gives the traces their chamfered PCB look. */
const CUT = 12;

interface Pt { x: number; y: number }

interface Chip {
  x: number; y: number; w: number; h: number;
  /** Pins per populated side. */
  pins: number;
  /** Which sides carry pins: all four, left+right, or top+bottom. */
  sides: 'all' | 'lr' | 'tb';
  label: string;
  /** Draw an inner die outline (the "big" chip only). */
  die?: boolean;
  /** Draw the round orientation notch on the left edge. */
  notch?: boolean;
}

/* ── the composition ────────────────────────────────────────────────────────
   Coordinates are hand-placed against where the hero's own content sits: the
   wordmark owns the middle, and the service cards own the four corners, so the
   chips live in the gaps between them (lower-centre, mid-right, mid-left and
   lower-right) and the rest is left as breathing room. ──────────────────── */

const U1: Chip = { x: 590, y: 655, w: 180, h: 180, pins: 5, sides: 'all', label: 'U1', die: true };
const U2: Chip = { x: 1150, y: 300, w: 200, h: 120, pins: 4, sides: 'lr', label: 'U2', notch: true };
const U3: Chip = { x: 150, y: 305, w: 130, h: 95, pins: 3, sides: 'lr', label: 'U3' };
const U4: Chip = { x: 1310, y: 620, w: 120, h: 90, pins: 4, sides: 'tb', label: 'U4' };

const CHIPS = [U1, U2, U3, U4];

const pinX = (c: Chip, i: number) => c.x + ((i + 1) * c.w) / (c.pins + 1);
const pinY = (c: Chip, i: number) => c.y + ((i + 1) * c.h) / (c.pins + 1);

/** Outer tip of a pin lead — trace waypoints start and end here. */
const topPin = (c: Chip, i: number): Pt => ({ x: pinX(c, i), y: c.y - PIN_LEN });
const botPin = (c: Chip, i: number): Pt => ({ x: pinX(c, i), y: c.y + c.h + PIN_LEN });
const leftPin = (c: Chip, i: number): Pt => ({ x: c.x - PIN_LEN, y: pinY(c, i) });
const rightPin = (c: Chip, i: number): Pt => ({ x: c.x + c.w + PIN_LEN, y: pinY(c, i) });

interface Trace { pts: Pt[]; strong?: boolean }

const TRACES: Trace[] = [
  // U3 ─ U1, stepping down across the empty left-middle band.
  {
    strong: true,
    pts: [
      rightPin(U3, 1), { x: 430, y: pinY(U3, 1) }, { x: 430, y: 500 },
      { x: 500, y: 500 }, { x: 500, y: pinY(U1, 2) }, leftPin(U1, 2),
    ],
  },
  // U1 ─ U2, the long run under the wordmark and up the right side.
  {
    strong: true,
    pts: [
      rightPin(U1, 1), { x: 900, y: pinY(U1, 1) }, { x: 900, y: 560 },
      { x: 1050, y: 560 }, { x: 1050, y: pinY(U2, 2) }, leftPin(U2, 2),
    ],
  },
  // U2 out through the right edge.
  { pts: [rightPin(U2, 1), { x: 1470, y: pinY(U2, 1) }, { x: 1470, y: 180 }, { x: REF_W, y: 180 }] },
  // U2 ─ U4.
  {
    pts: [
      rightPin(U2, 3), { x: 1440, y: pinY(U2, 3) }, { x: 1440, y: 520 },
      { x: pinX(U4, 1), y: 520 }, topPin(U4, 1),
    ],
  },
  // U4 back along the bottom, ending in a pad.
  { pts: [botPin(U4, 1), { x: pinX(U4, 1), y: 840 }, { x: 1010, y: 840 }] },
  // U1 straight out through the bottom edge.
  { pts: [botPin(U1, 2), { x: pinX(U1, 2), y: REF_H }] },
  // U1 up and away across the top edge.
  {
    pts: [
      topPin(U1, 1), { x: pinX(U1, 1), y: 560 }, { x: 360, y: 560 },
      { x: 360, y: 120 }, { x: 760, y: 120 }, { x: 760, y: 0 },
    ],
  },
  // U3 up into the top-left corner.
  { pts: [leftPin(U3, 1), { x: 60, y: pinY(U3, 1) }, { x: 60, y: 120 }, { x: 250, y: 120 }] },
  // A feed in from the left edge.
  { pts: [{ x: 0, y: 470 }, { x: 240, y: 470 }, { x: 240, y: 620 }, { x: 330, y: 620 }] },
];

/** Staggered bus in the empty bottom-left — pure texture, connected to nothing. */
const RIBBON: { y: number; x2: number }[] = [
  { y: 850, x2: 430 },
  { y: 868, x2: 470 },
  { y: 886, x2: 510 },
];

type PartKind = 'R' | 'C' | 'L' | 'D';
interface Part { kind: PartKind; x: number; y: number; rot: number }

/** Part symbols, each sitting on a straight run of the trace above it. */
const PARTS: Part[] = [
  { kind: 'R', x: 500, y: 620, rot: 90 },
  { kind: 'C', x: 900, y: 640, rot: 90 },
  { kind: 'L', x: 1470, y: 265, rot: 90 },
  { kind: 'D', x: 520, y: 560, rot: 0 },
  { kind: 'R', x: 1150, y: 840, rot: 0 },
  { kind: 'C', x: 240, y: 545, rot: 90 },
];

/** Free trace ends and standalone test points — drawn as ring pads. */
const RING_PADS: Pt[] = [
  { x: 250, y: 120 }, { x: 330, y: 620 }, { x: 1010, y: 840 },
  { x: 430, y: 850 }, { x: 470, y: 868 }, { x: 510, y: 886 },
  { x: 1520, y: 470 }, { x: 70, y: 700 }, { x: 1085, y: 150 },
];

/** Board mounting holes. */
const HOLES: Pt[] = [{ x: 95, y: 95 }, { x: 1505, y: 805 }];

/* ── drawing ────────────────────────────────────────────────────────────── */

/** Orthogonal waypoints → a path with 45°-cut corners. */
function chamfered(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    if (la === 0 || lb === 0) continue;
    const r = Math.min(CUT, la / 2, lb / 2);
    d += ` L ${p.x - ((p.x - a.x) / la) * r} ${p.y - ((p.y - a.y) / la) * r}`;
    d += ` L ${p.x + ((b.x - p.x) / lb) * r} ${p.y + ((b.y - p.y) / lb) * r}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function chipSvg(c: Chip, pal: CircuitPalette): string {
  const leads: string[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number) =>
    leads.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

  for (let i = 0; i < c.pins; i++) {
    if (c.sides === 'all' || c.sides === 'lr') {
      push(c.x - PIN_LEN, pinY(c, i), c.x, pinY(c, i));
      push(c.x + c.w, pinY(c, i), c.x + c.w + PIN_LEN, pinY(c, i));
    }
    if (c.sides === 'all' || c.sides === 'tb') {
      push(pinX(c, i), c.y - PIN_LEN, pinX(c, i), c.y);
      push(pinX(c, i), c.y + c.h, pinX(c, i), c.y + c.h + PIN_LEN);
    }
  }

  const die = c.die
    ? `<rect x="${c.x + 26}" y="${c.y + 26}" width="${c.w - 52}" height="${c.h - 52}" rx="4" fill="none" stroke="${pal.accent}" stroke-width="${SW}"/>`
    : '';
  const notch = c.notch
    ? `<path d="M ${c.x} ${c.y + c.h / 2 - 12} A 12 12 0 0 0 ${c.x} ${c.y + c.h / 2 + 12}" fill="none" stroke="${pal.outline}" stroke-width="${SW}"/>`
    : '';
  const pin1 = `<circle cx="${c.x + 17}" cy="${c.y + 17}" r="5" fill="${pal.accent}"/>`;
  const text =
    `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2}" fill="${pal.label}" font-family="ui-monospace,monospace"` +
    ` font-size="15" letter-spacing="2" text-anchor="middle" dominant-baseline="central">${c.label}</text>`;

  return (
    `<g stroke="${pal.outline}" stroke-width="${SW}" fill="none" stroke-linecap="round">${leads.join('')}</g>` +
    `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="7" fill="${pal.bg}" stroke="${pal.outline}" stroke-width="${SW}"/>` +
    die + notch + pin1 + text
  );
}

function partSvg(p: Part, pal: CircuitPalette): string {
  const wrap = (inner: string) =>
    `<g transform="translate(${p.x} ${p.y}) rotate(${p.rot})" stroke="${pal.outline}"` +
    ` stroke-width="${SW}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

  switch (p.kind) {
    case 'R':
      return wrap(`<rect x="-15" y="-6" width="30" height="12" rx="1.5" fill="${pal.bg}"/>`);
    case 'C':
      return wrap(
        `<rect x="-6" y="-15" width="12" height="30" fill="${pal.bg}" stroke="none"/>` +
        `<line x1="-4" y1="-13" x2="-4" y2="13"/><line x1="4" y1="-13" x2="4" y2="13"/>`,
      );
    case 'L':
      return wrap(
        `<rect x="-19" y="-13" width="38" height="14" fill="${pal.bg}" stroke="none"/>` +
        `<path d="M -18 0 A 6 8 0 0 1 -6 0 A 6 8 0 0 1 6 0 A 6 8 0 0 1 18 0"/>`,
      );
    case 'D':
      return wrap(
        `<rect x="-10" y="-13" width="20" height="26" fill="${pal.bg}" stroke="none"/>` +
        `<path d="M -7 -10 L 6 0 L -7 10 Z" fill="${pal.bg}"/><line x1="6" y1="-11" x2="6" y2="11"/>`,
      );
    default:
      return '';
  }
}

function buildSvg(pal: CircuitPalette): string {
  const traceEls = TRACES.map(
    (t) =>
      `<path d="${chamfered(t.pts)}" stroke="${t.strong ? pal.traceStrong : pal.trace}"` +
      ` stroke-width="${t.strong ? SW * 1.3 : SW}"/>`,
  ).join('');

  const ribbonEls = RIBBON.map(
    (r) => `<path d="M 60 ${r.y} H ${r.x2}" stroke="${pal.trace}" stroke-width="${SW}"/>`,
  ).join('');

  /** A small filled via wherever a trace turns a corner. */
  const viaEls = TRACES.flatMap((t) => t.pts.slice(1, -1))
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${pal.node}"/>`)
    .join('');

  const ringEls = RING_PADS.map(
    (p) =>
      `<circle cx="${p.x}" cy="${p.y}" r="7" fill="${pal.bg}" stroke="${pal.node}" stroke-width="${SW}"/>`,
  ).join('');

  const holeEls = HOLES.map(
    (p) =>
      `<circle cx="${p.x}" cy="${p.y}" r="17" fill="none" stroke="${pal.trace}" stroke-width="${SW}"/>` +
      `<circle cx="${p.x}" cy="${p.y}" r="9" fill="none" stroke="${pal.node}" stroke-width="${SW}"/>`,
  ).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REF_W} ${REF_H}">` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${traceEls}${ribbonEls}</g>` +
    CHIPS.map((c) => chipSvg(c, pal)).join('') +
    PARTS.map((p) => partSvg(p, pal)).join('') +
    viaEls + ringEls + holeEls +
    `</svg>`
  );
}

/**
 * Module-scope cache keyed on the palette object — HomePage's palettes are
 * module constants, so this builds the markup at most once per theme for the
 * lifetime of the tab, even across unmounts.
 */
const urlCache = new Map<CircuitPalette, string>();

function circuitUrl(pal: CircuitPalette): string {
  let url = urlCache.get(pal);
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(buildSvg(pal))}`;
    urlCache.set(pal, url);
  }
  return url;
}

export const CircuitBackdrop = memo(function CircuitBackdrop({ pal }: { pal: CircuitPalette }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url("${circuitUrl(pal)}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        pointerEvents: 'none',
      }}
    />
  );
});
