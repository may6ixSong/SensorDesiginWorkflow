import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';
import { HERO_SERVICES } from '@/config/heroServices';
import { AnalogSchematic, SchematicPalette } from '@/components/home/AnalogSchematic';

const LANES = ['CONCEPT', 'DESIGN', 'VERIFY', 'TAPE-OUT'];

const HERO_REF_W = 1600;
const HERO_REF_H = 896;
const HUB = { x: 50, y: 45 };

function toPct(px: number, py: number) {
  return { x: 50 + (px / HERO_REF_W) * 100, y: 50 + (py / HERO_REF_H) * 100 };
}

function connectorPath(svcX: number, svcY: number) {
  const { x, y } = toPct(svcX, svcY);
  const midX = (x + HUB.x) / 2;
  const midY = (y + HUB.y) / 2 + (y > HUB.y ? -6 : 6);
  return `M ${x} ${y} Q ${midX} ${midY}, ${HUB.x} ${HUB.y}`;
}

function circuitTrace(svcX: number, svcY: number, seed: number) {
  const { x: px, y: py } = toPct(svcX, svcY);
  const rand = makeRng(seed);
  const dir = rand() < 0.5 ? -1 : 1;
  const vdir = rand() < 0.5 ? -1 : 1;
  const x1 = px + dir * (2.2 + rand() * 2.2);
  const y1 = py + vdir * (1.6 + rand() * 2);
  const x2 = x1 + dir * (1.2 + rand() * 1.6);
  return {
    d: `M ${px} ${py} H ${x1} V ${y1} H ${x2}`,
    vias: [{ x: px, y: py }, { x: x1, y: py }, { x: x1, y: y1 }, { x: x2, y: y1 }],
  };
}

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
  cardBorder: string;
  cardShadow: string;
  cardText: string;
  cardSub: string;
  wordmarkGradient: string;
  wordmarkGlow: string;
  subCopy: string;
  flowStroke: string;
  pulse: string;
  ctaBg: string;
  ctaText: string;
  ctaShadow: string;
  ctaShadowHover: string;
  schematic: SchematicPalette;
  connLive: string;
  connPending: string;
  badgeLiveBg: string;
  badgeLiveText: string;
  badgePendingText: string;
}

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}


const PALETTE: Record<'light' | 'dark', Palette> = {
  dark: {
    stageBg: '#0a0d14',
    aurora:
      'radial-gradient(60% 50% at 28% 22%, rgba(72,112,146,.18), transparent 70%),' +
      'radial-gradient(55% 46% at 76% 72%, rgba(62,84,124,.16), transparent 72%)',
    gridLine:
      'linear-gradient(rgba(126,156,190,.16) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(126,156,190,.13) 1px, transparent 1px)',
    gridMask: 'linear-gradient(to top, #000 2%, transparent 66%)',
    laneBorder: 'rgba(142,168,200,.07)',
    laneBg: 'linear-gradient(160deg, rgba(142,168,200,.055), rgba(142,168,200,.015))',
    laneText: 'rgba(150,172,200,.42)',
    cardBg: 'linear-gradient(160deg, rgba(24,30,42,.97), rgba(16,21,30,.95))',
    cardBorder: 'rgba(255,255,255,.09)',
    cardShadow: '0 10px 28px rgba(0,0,0,.5)',
    cardText: '#e8edf5',
    cardSub: 'rgba(150,172,200,.58)',
    wordmarkGradient: 'linear-gradient(180deg,#f2f6fb 0%,#a9b8cb 100%)',
    wordmarkGlow: 'none',
    subCopy: 'rgba(150,172,200,.62)',
    flowStroke: 'rgba(120,158,190,.26)',
    pulse: 'rgba(94,185,164,.7)',
    ctaBg: '#1c9d85',
    ctaText: '#ffffff',
    ctaShadow: '0 6px 18px rgba(0,0,0,.4)',
    ctaShadowHover: '0 10px 24px rgba(0,0,0,.5)',
    schematic: {
      bg: '#0a0d14',
      line: 'rgba(126,158,196,.13)',
      rail: 'rgba(126,158,196,.19)',
      comp: 'rgba(126,158,196,.20)',
      node: 'rgba(150,178,210,.32)',
      active: 'rgba(94,185,164,.34)',
    },
    connLive: 'rgba(94,185,164,.58)',
    connPending: 'rgba(122,148,184,.17)',
    badgeLiveBg: 'rgba(94,185,164,.12)',
    badgeLiveText: '#6fc7b0',
    badgePendingText: 'rgba(150,172,200,.5)',
  },
  light: {
    stageBg: '#f4f6f9',
    aurora:
      'radial-gradient(60% 50% at 28% 22%, rgba(92,124,158,.11), transparent 70%),' +
      'radial-gradient(55% 46% at 76% 72%, rgba(82,104,144,.09), transparent 72%)',
    gridLine:
      'linear-gradient(rgba(92,118,152,.14) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(92,118,152,.11) 1px, transparent 1px)',
    gridMask: 'linear-gradient(to top, #000 2%, transparent 66%)',
    laneBorder: 'rgba(70,96,132,.07)',
    laneBg: 'linear-gradient(160deg, rgba(70,96,132,.045), rgba(70,96,132,.012))',
    laneText: 'rgba(80,102,132,.48)',
    cardBg: '#ffffff',
    cardBorder: 'rgba(20,32,47,.10)',
    cardShadow: '0 8px 22px rgba(30,42,70,.09), 0 1px 2px rgba(30,42,70,.06)',
    cardText: '#101828',
    cardSub: '#667085',
    wordmarkGradient: 'linear-gradient(180deg,#16202e 0%,#5a687a 100%)',
    wordmarkGlow: 'none',
    subCopy: '#667085',
    flowStroke: 'rgba(70,100,140,.2)',
    pulse: 'rgba(12,154,131,.6)',
    ctaBg: '#0c9a83',
    ctaText: '#ffffff',
    ctaShadow: '0 6px 16px rgba(12,154,131,.2)',
    ctaShadowHover: '0 10px 22px rgba(12,154,131,.28)',
    schematic: {
      bg: '#f4f6f9',
      line: 'rgba(46,74,110,.14)',
      rail: 'rgba(46,74,110,.20)',
      comp: 'rgba(46,74,110,.21)',
      node: 'rgba(46,74,110,.34)',
      active: 'rgba(12,154,131,.34)',
    },
    connLive: 'rgba(12,154,131,.48)',
    connPending: 'rgba(70,96,140,.15)',
    badgeLiveBg: 'rgba(12,154,131,.1)',
    badgeLiveText: '#0a8a75',
    badgePendingText: '#8b99ab',
  },
} as const;

export function HomePage() {
  const { data: users } = useUsers();
  const { mode } = useThemeMode();
  const pal = useMemo(() => PALETTE[mode], [mode]);

  const [active, setActive] = useState<Set<string> | null>(null);
  const idleTimer = useRef<number>();
  const revertTimer = useRef<number>();

  const clearTimers = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (revertTimer.current) window.clearTimeout(revertTimer.current);
  };

  const onStageMouseMove = useCallback(() => {
    clearTimers();
    setActive(null);
    idleTimer.current = window.setTimeout(() => {
      const n = 1 + Math.floor(Math.random() * 5);
      const shuffled = [...HERO_SERVICES].sort(() => Math.random() - 0.5);
      setActive(new Set(shuffled.slice(0, n).map((s) => s.name)));
      revertTimer.current = window.setTimeout(() => setActive(null), 5000);
    }, 450);
  }, []);

  useEffect(() => () => clearTimers(), []);

  return (
    <AppShell users={users ?? []}>
      <Box
        onMouseMove={onStageMouseMove}
        onMouseLeave={() => { clearTimers(); setActive(null); }}
        sx={{
          position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden',
          background: pal.stageBg,
          transition: 'background .3s',
          display: 'grid', placeItems: 'center',
          perspective: '1400px', perspectiveOrigin: '50% 45%',
          '@keyframes acroDrift': {
            from: { backgroundPosition: '0 0' },
            to: { backgroundPosition: '0 -800px' },
          },
          '@keyframes acroGlow': {
            '0%,100%': { opacity: 0.75 },
            '50%': { opacity: 1 },
          },
          '@keyframes acroRise': {
            from: { opacity: 0, transform: 'translateY(14px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/* back-most layer — one connected analog circuit filling the stage */}
        <AnalogSchematic pal={pal.schematic} />

        {/* aurora backdrop */}
        <Box
          sx={{
            position: 'absolute', inset: '-30%', pointerEvents: 'none',
            background: pal.aurora,
            filter: 'blur(20px)',
            animation: 'acroGlow 16s ease-in-out infinite',
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
            animation: 'acroDrift 18s linear infinite',
            maskImage: pal.gridMask,
            WebkitMaskImage: pal.gridMask,
            pointerEvents: 'none',
            transition: 'background-image .3s',
          }}
        />

        {/* flow lines — lanes converging up into the wordmark */}
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
            <circle key={`p-${d}`} r={0.38} fill={pal.pulse} opacity={0}>
              <animateMotion dur={`${3.2 + i * 0.5}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" rotate="auto">
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

        {/* faint circuit traces behind each service card */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {HERO_SERVICES.map((svc, i) => {
            const trace = circuitTrace(svc.x, svc.y, 100 + i);
            return (
              <g key={svc.name}>
                <path
                  d={trace.d}
                  fill="none"
                  stroke={pal.schematic.line}
                  strokeWidth={0.9}
                  vectorEffect="non-scaling-stroke"
                />
                {trace.vias.map((v, vi) => (
                  <ellipse key={vi} cx={v.x} cy={v.y} rx={0.12} ry={0.24} fill={pal.schematic.node} />
                ))}
              </g>
            );
          })}
        </Box>

        {/* service connectors */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {HERO_SERVICES.map((svc, i) => {
            const d = connectorPath(svc.x, svc.y);
            const dim = active !== null && !active.has(svc.name);
            return (
              <path
                key={svc.name}
                id={`acro-conn-${i}`}
                d={d}
                fill="none"
                stroke={svc.connected ? pal.connLive : pal.connPending}
                strokeWidth={svc.connected ? 0.22 : 0.14}
                strokeDasharray={svc.connected ? '1.3 1.1' : '0.4 2.4'}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  opacity: dim ? 0.12 : 1,
                  transition: 'opacity .5s ease',
                  ...(svc.connected ? { animation: `flowdash ${2.6 + i * 0.35}s linear infinite` } : {}),
                }}
              />
            );
          })}
          {HERO_SERVICES.filter((s) => s.connected).map((svc, i) => (
            <circle key={`p-${svc.name}`} r={0.38} fill={pal.connLive} opacity={0}>
              <animateMotion
                dur={`${3 + i * 0.6}s`}
                begin={`${i * 0.7}s`}
                repeatCount="indefinite"
                rotate="auto"
              >
                <mpath href={`#acro-conn-${HERO_SERVICES.findIndex((s) => s.name === svc.name)}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.1;0.9;1"
                dur={`${3 + i * 0.6}s`}
                begin={`${i * 0.7}s`}
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
            transform: 'translateZ(-40px)',
            display: 'grid', placeItems: 'center',
          }}
        >
          {/* lane plates */}
          <Box sx={{ position: 'absolute', display: 'flex', gap: '18px', transform: 'translateZ(-320px)' }}>
            {LANES.map((l, i) => (
              <Box key={l} sx={{ transform: `translateZ(${i * 22}px)`, transformStyle: 'preserve-3d' }}>
                <Box
                  sx={{
                    width: 190, height: 300, borderRadius: '10px',
                    border: `1px solid ${pal.laneBorder}`,
                    background: pal.laneBg,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '14px',
                    fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.24em',
                    color: pal.laneText,
                    transition: 'background .3s, border-color .3s, color .3s',
                  }}
                >
                  {l}
                </Box>
              </Box>
            ))}
          </Box>

          {/* floating service cards */}
          {HERO_SERVICES.map((svc) => {
            const isDim = active !== null && !active.has(svc.name);
            const isBoosted = active !== null && active.has(svc.name);
            return (
              <Box
                key={svc.name}
                sx={{
                  position: 'absolute', pointerEvents: 'none', transformStyle: 'preserve-3d',
                  transform: `translate3d(${svc.x}px, ${svc.y}px, ${svc.z}px) rotateY(${svc.r}deg)`,
                }}
              >
                <Box
                  sx={{
                    width: 224, padding: '15px 16px', borderRadius: '10px',
                    background: pal.cardBg,
                    border: `1px solid ${isBoosted ? svc.color : pal.cardBorder}`,
                    boxShadow: pal.cardShadow,
                    color: pal.cardText,
                    opacity: isDim ? 0.28 : 1,
                    transition: 'opacity .5s ease, background .3s, border-color .35s, box-shadow .3s, color .3s',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '9px' }}>
                    <Box sx={{ width: 22, height: 2, borderRadius: 1, background: svc.color }} />
                    <Box
                      sx={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontFamily: FONT_MONO, fontSize: 8, letterSpacing: '.08em',
                        padding: '2px 6px', borderRadius: '999px',
                        background: svc.connected ? pal.badgeLiveBg : 'transparent',
                        color: svc.connected ? pal.badgeLiveText : pal.badgePendingText,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: 'currentColor',
                          boxShadow: svc.connected ? '0 0 5px currentColor' : 'none',
                        }}
                      />
                      {svc.connected ? `LIVE ${svc.port}` : 'PENDING'}
                    </Box>
                  </Box>
                  <Box sx={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-.01em' }}>{svc.name}</Box>
                  <Box
                    sx={{
                      fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
                      color: pal.cardSub, mt: '5px', transition: 'color .3s',
                    }}
                  >
                    {svc.tag}
                  </Box>
                </Box>
              </Box>
            );
          })}

          {/* wordmark */}
          <Box sx={{ position: 'relative', textAlign: 'center', transform: 'translateZ(190px)' }}>
            <Box
              sx={{
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: 'clamp(64px, 9.5vw, 132px)', lineHeight: 0.9, letterSpacing: '-.03em',
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
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.38em',
                color: pal.subCopy, mt: '16px', pl: '.38em',
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
              <HeroLink to="/projects" pal={pal}>View Projects</HeroLink>
            </Box>
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}

function HeroLink({ to, pal, children }: { to: string; pal: Palette; children: React.ReactNode }) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '11px 24px', borderRadius: '8px',
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
        color: pal.ctaText,
        background: pal.ctaBg,
        boxShadow: pal.ctaShadow,
        transition: 'transform .18s ease, box-shadow .18s ease, background .3s',
        '&:hover': { transform: 'translateY(-1px)', boxShadow: pal.ctaShadowHover },
      }}
    >
      {children}
    </Box>
  );
}
