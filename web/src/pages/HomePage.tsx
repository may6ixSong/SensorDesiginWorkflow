import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';

/** Deliverable cards floating in the 3D stage — placed x/y/z around the wordmark, r = tilt. */
const CARDS = [
  { t: 'PLL Requirements Spec', s: 'REQ · v2.1', x: -500, y: -235, z: 210, r: 16, d: 0, c: '#2ee6c5' },
  { t: 'Bandgap Schematic', s: 'SCH · v1.4', x: -540, y: 95, z: 90, r: 20, d: 0.7, c: '#7c8cff' },
  { t: 'LDO Characterization', s: 'RPT · v3.0', x: 500, y: -250, z: 130, r: -18, d: 1.3, c: '#ffb45e' },
  { t: 'ADC Verification', s: 'VER · v1.0', x: 545, y: 75, z: 230, r: -22, d: 1.9, c: '#2ee6c5' },
  { t: 'HLD Release', s: 'REL · v4.2', x: -30, y: 265, z: 290, r: 0, d: 2.5, c: '#ff6f91' },
];

const LANES = ['CONCEPT', 'DESIGN', 'VERIFY', 'TAPE-OUT'];

/** Bottom anchor (x%, per-lane) each flow line starts from, converging up into the wordmark. */
const FLOW_PATHS = [
  'M 10 92 C 25 70, 34 55, 49 40',
  'M 30 96 C 38 74, 42 58, 49.5 41',
  'M 90 92 C 75 70, 66 55, 51 40',
  'M 70 96 C 62 74, 58 58, 50.5 41',
];

interface Palette {
  stageBg: string;
  aurora: string;
  gridLine: string;
  gridMask: string;
  laneBorder: string;
  laneBg: string;
  laneText: string;
  cardBg: string;
  cardBorder: (c: string) => string;
  cardShadow: (c: string) => string;
  cardText: string;
  cardSub: string;
  wordmarkGradient: string;
  wordmarkGlow: string;
  subCopy: string;
  flowStroke: string;
  pulse: string;
  ctaGhostText: string;
  ctaGhostBg: string;
  ctaGhostBorder: string;
  ctaGhostShadow: string;
  circuitLine: string;
  circuitNode: string;
  circuitActive: string;
}

/** Seeded PRNG (Park–Miller) so the backdrop graph is stable across re-renders. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface GraphNode { x: number; y: number }
interface GraphEdge { a: GraphNode; b: GraphNode; active: boolean }

/**
 * Sparse circuit-board style constellation covering the full stage — the very
 * back-most layer, behind the aurora. Fills the empty corners with quiet,
 * always-on motion instead of flat dead space, without touching the existing
 * composition (lanes/cards/wordmark) in front of it.
 */
function useCircuitGraph(count: number, seed = 7): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return useMemo(() => {
    const rand = makeRng(seed);
    const nodes: GraphNode[] = Array.from({ length: count }, () => ({
      x: rand() * 100,
      y: rand() * 100,
    }));
    const seen = new Set<string>();
    const edges: GraphEdge[] = [];
    nodes.forEach((n, i) => {
      const near = nodes
        .map((m, j) => ({ j, d: Math.hypot(n.x - m.x, n.y - m.y) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .filter((o) => o.d < 20);
      near.forEach((o) => {
        const key = [Math.min(i, o.j), Math.max(i, o.j)].join('-');
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ a: n, b: nodes[o.j], active: rand() < 0.3 });
        }
      });
    });
    return { nodes, edges };
  }, [count, seed]);
}

const PALETTE: Record<'light' | 'dark', Palette> = {
  dark: {
    stageBg: '#070b14',
    aurora:
      'radial-gradient(48% 42% at 24% 28%, rgba(46,230,197,.42), transparent 62%),' +
      'radial-gradient(46% 40% at 78% 64%, rgba(124,140,255,.46), transparent 64%),' +
      'radial-gradient(38% 34% at 52% 92%, rgba(255,111,145,.30), transparent 66%)',
    gridLine:
      'linear-gradient(rgba(46,230,197,.55) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(124,140,255,.42) 1px, transparent 1px)',
    gridMask: 'linear-gradient(to top, #000 2%, transparent 72%)',
    laneBorder: 'rgba(124,140,255,.42)',
    laneBg: 'linear-gradient(160deg, rgba(124,140,255,.20), rgba(46,230,197,.07))',
    laneText: 'rgba(180,206,255,.75)',
    cardBg: 'linear-gradient(150deg, rgba(31,48,78,.96), rgba(13,22,40,.92))',
    cardBorder: (c: string) => `${c}55`,
    cardShadow: (c: string) => `0 30px 70px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.14), 0 0 40px ${c}33`,
    cardText: '#eaf2ff',
    cardSub: 'rgba(180,206,255,.7)',
    wordmarkGradient: 'linear-gradient(178deg,#ffffff 8%,#b7f5e6 42%,#7c8cff 100%)',
    wordmarkGlow: 'drop-shadow(0 24px 46px rgba(46,230,197,.34)) drop-shadow(0 4px 0 rgba(124,140,255,.30))',
    subCopy: 'rgba(180,206,255,.82)',
    flowStroke: 'rgba(46,230,197,.55)',
    pulse: '#2ee6c5',
    ctaGhostText: '#dce7ff',
    ctaGhostBg: 'rgba(255,255,255,.07)',
    ctaGhostBorder: 'rgba(255,255,255,.24)',
    ctaGhostShadow: '0 12px 28px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.16)',
    circuitLine: 'rgba(140,170,255,.16)',
    circuitNode: 'rgba(180,206,255,.5)',
    circuitActive: 'rgba(46,230,197,.6)',
  },
  light: {
    stageBg: '#eef1f8',
    aurora:
      'radial-gradient(48% 42% at 24% 28%, rgba(12,154,131,.20), transparent 62%),' +
      'radial-gradient(46% 40% at 78% 64%, rgba(88,73,207,.20), transparent 64%),' +
      'radial-gradient(38% 34% at 52% 92%, rgba(199,79,120,.14), transparent 66%)',
    gridLine:
      'linear-gradient(rgba(12,154,131,.30) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(88,73,207,.22) 1px, transparent 1px)',
    gridMask: 'linear-gradient(to top, #000 2%, transparent 72%)',
    laneBorder: 'rgba(88,73,207,.30)',
    laneBg: 'linear-gradient(160deg, rgba(88,73,207,.09), rgba(12,154,131,.06))',
    laneText: 'rgba(60,74,104,.72)',
    cardBg: 'linear-gradient(150deg, #ffffff, #eef1f9)',
    cardBorder: (c: string) => `${c}70`,
    cardShadow: (c: string) => `0 24px 50px rgba(30,42,70,.16), inset 0 1px 0 rgba(255,255,255,.7), 0 0 26px ${c}2a`,
    cardText: '#14202f',
    cardSub: 'rgba(60,74,104,.65)',
    wordmarkGradient: 'linear-gradient(178deg,#0f1b2b 12%,#0c9a83 58%,#5849cf 100%)',
    wordmarkGlow: 'drop-shadow(0 18px 30px rgba(12,154,131,.20))',
    subCopy: '#5c6d84',
    flowStroke: 'rgba(12,154,131,.55)',
    pulse: '#0c9a83',
    ctaGhostText: '#14202f',
    ctaGhostBg: 'rgba(255,255,255,.55)',
    ctaGhostBorder: 'rgba(20,32,47,.16)',
    ctaGhostShadow: '0 12px 24px rgba(30,42,70,.10), inset 0 1px 0 rgba(255,255,255,.7)',
    circuitLine: 'rgba(60,80,140,.12)',
    circuitNode: 'rgba(60,80,140,.35)',
    circuitActive: 'rgba(12,154,131,.5)',
  },
} as const;

/**
 * Landing hero — no explanatory "what is this system" panel, just the 3D scene.
 * Mouse position streams into CSS vars (--mx/--my) to tilt the whole stage, and dashed
 * paths carry the mockup's `flowdash` animation so lanes visibly flow up into the wordmark.
 */
export function HomePage() {
  const { data: users } = useUsers();
  const { mode } = useThemeMode();
  const pal = useMemo(() => PALETTE[mode], [mode]);
  const { nodes: circuitNodes, edges: circuitEdges } = useCircuitGraph(46);
  const stageRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width - 0.5;
    const my = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', String(mx));
      el.style.setProperty('--my', String(my));
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <AppShell users={users ?? []}>
      <Box
        ref={stageRef}
        onMouseMove={onMove}
        onMouseLeave={() => {
          stageRef.current?.style.setProperty('--mx', '0');
          stageRef.current?.style.setProperty('--my', '0');
        }}
        sx={{
          '--mx': 0, '--my': 0,
          position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden',
          background: pal.stageBg,
          transition: 'background .3s',
          display: 'grid', placeItems: 'center',
          perspective: '1400px', perspectiveOrigin: '50% 45%',
          '@keyframes acroFloat': {
            '0%,100%': { transform: 'translateY(0)' },
            '50%': { transform: 'translateY(-22px)' },
          },
          '@keyframes acroDrift': {
            from: { backgroundPosition: '0 0' },
            to: { backgroundPosition: '0 -800px' },
          },
          '@keyframes acroGlow': {
            '0%,100%': { opacity: 0.55 },
            '50%': { opacity: 0.9 },
          },
          '@keyframes acroRise': {
            from: { opacity: 0, transform: 'translateY(26px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/* backmost layer — sparse circuit-board constellation filling the empty space */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {circuitEdges.map((e, i) => (
            <line
              key={i}
              x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
              stroke={e.active ? pal.circuitActive : pal.circuitLine}
              strokeWidth={e.active ? 0.16 : 0.12}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={e.active ? '1.4 1.2' : undefined}
              style={e.active ? { animation: `flowdash ${4 + (i % 5)}s linear infinite` } : undefined}
            />
          ))}
          {circuitNodes.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={0.28} fill={pal.circuitNode}>
              <animate
                attributeName="opacity"
                values="0.15;0.85;0.15"
                dur={`${3.5 + (i % 6) * 0.6}s`}
                begin={`${(i % 9) * 0.35}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </Box>

        {/* aurora backdrop */}
        <Box
          sx={{
            position: 'absolute', inset: '-30%', pointerEvents: 'none',
            background: pal.aurora,
            filter: 'blur(14px)',
            animation: 'acroGlow 9s ease-in-out infinite',
            transition: 'background .3s',
          }}
        />

        {/* 3D grid floor */}
        <Box
          sx={{
            position: 'absolute', left: '-40%', right: '-40%', bottom: '-24%', height: '78%',
            transformOrigin: '50% 100%',
            transform: 'rotateX(74deg)',
            backgroundImage: pal.gridLine,
            backgroundSize: '80px 80px',
            animation: 'acroDrift 6s linear infinite',
            maskImage: pal.gridMask,
            WebkitMaskImage: pal.gridMask,
            pointerEvents: 'none',
            transition: 'background-image .3s',
          }}
        />

        {/* flow lines — lanes converging up into the wordmark, dashes carry the canvas's flowdash motion */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {FLOW_PATHS.map((d, i) => (
            <path
              key={d}
              id={`acro-flow-${i}`}
              d={d}
              fill="none"
              stroke={pal.flowStroke}
              strokeWidth={0.28}
              strokeDasharray="1.6 1.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ animation: `flowdash ${2.4 + i * 0.3}s linear infinite` }}
            />
          ))}
          {FLOW_PATHS.map((d, i) => (
            <circle key={`p-${d}`} r={0.6} fill={pal.pulse} opacity={0}>
              <animateMotion
                dur={`${3.2 + i * 0.5}s`}
                begin={`${i * 0.6}s`}
                repeatCount="indefinite"
                rotate="auto"
              >
                <mpath href={`#acro-flow-${i}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.08;0.92;1"
                dur={`${3.2 + i * 0.5}s`}
                begin={`${i * 0.6}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </Box>

        {/* stage */}
        <Box
          sx={{
            position: 'relative', width: '100%', height: '100%',
            transformStyle: 'preserve-3d',
            transform:
              'rotateX(calc(var(--my) * -14deg)) rotateY(calc(var(--mx) * 20deg)) translateZ(-40px)',
            transition: 'transform .5s cubic-bezier(.2,.7,.3,1)',
            display: 'grid', placeItems: 'center',
          }}
        >
          {/* lane plates — the canvas's Phase lanes, stood up in 3D */}
          <Box
            sx={{
              position: 'absolute', display: 'flex', gap: '18px',
              transform: 'translateZ(-320px)',
              opacity: 0.5,
            }}
          >
            {LANES.map((l, i) => (
              // placement (translateZ) and the float animation are split into two layers
              // so they don't clobber each other's transform.
              <Box key={l} sx={{ transform: `translateZ(${i * 26}px)`, transformStyle: 'preserve-3d' }}>
                <Box
                  sx={{
                    width: 190, height: 300, borderRadius: '14px',
                    border: `1px solid ${pal.laneBorder}`,
                    background: pal.laneBg,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '14px',
                    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.22em',
                    color: pal.laneText,
                    animation: `acroFloat ${7 + i * 0.7}s ease-in-out ${i * 0.4}s infinite`,
                    transition: 'background .3s, border-color .3s, color .3s',
                  }}
                >
                  {l}
                </Box>
              </Box>
            ))}
          </Box>

          {/* floating deliverable cards */}
          {CARDS.map((c) => (
            <Box
              key={c.t}
              sx={{
                position: 'absolute', pointerEvents: 'none', transformStyle: 'preserve-3d',
                transform: `translate3d(${c.x}px, ${c.y}px, ${c.z}px) rotateY(${c.r}deg)`,
              }}
            >
              <Box
                sx={{
                  width: 224, padding: '15px 16px', borderRadius: '14px',
                  animation: `acroFloat ${6.5 + c.d}s ease-in-out ${c.d}s infinite`,
                  background: pal.cardBg,
                  border: `1px solid ${pal.cardBorder(c.c)}`,
                  boxShadow: pal.cardShadow(c.c),
                  color: pal.cardText,
                  transition: 'background .3s, border-color .3s, box-shadow .3s, color .3s',
                }}
              >
                <Box
                  sx={{
                    width: 26, height: 3, borderRadius: 2, background: c.c,
                    boxShadow: `0 0 14px ${c.c}`, mb: '9px',
                  }}
                />
                <Box sx={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-.01em' }}>{c.t}</Box>
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
                    color: pal.cardSub, mt: '5px', transition: 'color .3s',
                  }}
                >
                  {c.s}
                </Box>
              </Box>
            </Box>
          ))}

          {/* wordmark */}
          <Box sx={{ position: 'relative', textAlign: 'center', transform: 'translateZ(190px)' }}>
            <Box
              sx={{
                fontFamily: FONT_DISPLAY, fontWeight: 800,
                fontSize: 'clamp(72px, 12vw, 178px)', lineHeight: 0.86, letterSpacing: '-.045em',
                background: pal.wordmarkGradient,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                filter: pal.wordmarkGlow,
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) both',
                transition: 'filter .3s',
              }}
            >
              ACRO
            </Box>
            <Box
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.44em',
                color: pal.subCopy, mt: '14px', pl: '.44em',
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) .12s both',
                transition: 'color .3s',
              }}
            >
              CIS DELIVERABLE CONTROL
            </Box>

            <Box
              sx={{
                display: 'flex', justifyContent: 'center', mt: '34px',
                transformStyle: 'preserve-3d',
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) .24s both',
              }}
            >
              <HeroLink to="/projects" primary pal={pal}>View Projects</HeroLink>
            </Box>
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}

function HeroLink({
  to, primary, pal, children,
}: {
  to: string; primary?: boolean; pal: Palette; children: React.ReactNode;
}) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '13px 28px', borderRadius: '11px',
        fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
        transition: 'transform .22s cubic-bezier(.2,.8,.3,1), box-shadow .22s, background .3s, color .3s, border-color .3s',
        ...(primary
          ? {
              color: '#04140f',
              background: 'linear-gradient(150deg,#8ffbe2,#2ee6c5 60%,#12b7a4)',
              boxShadow: '0 14px 34px rgba(46,230,197,.42), inset 0 1px 0 rgba(255,255,255,.65)',
            }
          : {
              color: pal.ctaGhostText,
              background: pal.ctaGhostBg,
              border: `1px solid ${pal.ctaGhostBorder}`,
              boxShadow: pal.ctaGhostShadow,
            }),
        '&:hover': {
          transform: 'translateZ(28px) translateY(-3px)',
          boxShadow: primary
            ? '0 22px 48px rgba(46,230,197,.55), inset 0 1px 0 rgba(255,255,255,.7)'
            : pal.ctaGhostShadow,
        },
      }}
    >
      {children}
    </Box>
  );
}
