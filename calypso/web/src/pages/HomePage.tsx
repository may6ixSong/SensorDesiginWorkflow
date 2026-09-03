import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';
import { HERO_SERVICES } from '@/config/heroServices';
import { CircuitBackdrop, CircuitPalette } from '@/components/home/CircuitBackdrop';

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

/** Lanes converging up into the wordmark. Static — see the note on the stage. */
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
  subCopy: string;
  flowStroke: string;
  ctaBg: string;
  ctaText: string;
  ctaShadow: string;
  ctaShadowHover: string;
  circuit: CircuitPalette;
  connLive: string;
  connPending: string;
  badgeLiveBg: string;
  badgeLiveText: string;
  badgePendingText: string;
}


const PALETTE: Record<'light' | 'dark', Palette> = {
  dark: {
    stageBg: '#0a0d14',
    aurora:
      'radial-gradient(60% 50% at 28% 22%, rgba(90,130,110,.14), transparent 70%),' +
      'radial-gradient(55% 46% at 76% 72%, rgba(80,90,124,.13), transparent 72%)',
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
    subCopy: 'rgba(150,172,200,.62)',
    flowStroke: 'rgba(120,158,190,.2)',
    ctaBg: '#3f8362',
    ctaText: '#ffffff',
    ctaShadow: '0 4px 12px rgba(0,0,0,.35)',
    ctaShadowHover: '0 7px 16px rgba(0,0,0,.42)',
    circuit: {
      bg: '#0a0d14',
      trace: 'rgba(126,158,196,.17)',
      traceStrong: 'rgba(126,158,196,.26)',
      outline: 'rgba(142,174,210,.27)',
      node: 'rgba(150,178,210,.3)',
      accent: 'rgba(107,199,154,.35)',
      label: 'rgba(150,178,210,.3)',
    },
    connLive: 'rgba(107,199,154,.5)',
    connPending: 'rgba(122,148,184,.17)',
    badgeLiveBg: 'rgba(107,199,154,.1)',
    badgeLiveText: '#7fc79a',
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
    subCopy: '#667085',
    flowStroke: 'rgba(70,100,140,.16)',
    ctaBg: '#2f6b4a',
    ctaText: '#ffffff',
    ctaShadow: '0 4px 10px rgba(47,107,74,.18)',
    ctaShadowHover: '0 7px 14px rgba(47,107,74,.24)',
    circuit: {
      bg: '#f4f6f9',
      trace: 'rgba(46,74,110,.15)',
      traceStrong: 'rgba(46,74,110,.22)',
      outline: 'rgba(46,74,110,.26)',
      node: 'rgba(46,74,110,.3)',
      accent: 'rgba(47,107,74,.35)',
      label: 'rgba(46,74,110,.3)',
    },
    connLive: 'rgba(47,107,74,.42)',
    connPending: 'rgba(70,96,140,.15)',
    badgeLiveBg: 'rgba(47,107,74,.09)',
    badgeLiveText: '#2f6b4a',
    badgePendingText: '#8b99ab',
  },
} as const;

export function HomePage() {
  const { mode } = useThemeMode();
  const pal = useMemo(() => PALETTE[mode], [mode]);

  const [active, setActive] = useState<Set<string> | null>(null);
  const idleTimer = useRef<number>();
  const revertTimer = useRef<number>();
  /**
   * Mirrors `active` so the mousemove handler can skip the state write when
   * there is nothing lit. Without it every single pointer move re-rendered the
   * whole hero — that, not the artwork, is what made the page feel heavy.
   */
  const activeRef = useRef<Set<string> | null>(null);

  const clearTimers = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (revertTimer.current) window.clearTimeout(revertTimer.current);
  };

  const setLit = useCallback((next: Set<string> | null) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  const onStageMouseMove = useCallback(() => {
    clearTimers();
    setLit(null);
    idleTimer.current = window.setTimeout(() => {
      const n = 1 + Math.floor(Math.random() * 5);
      const shuffled = [...HERO_SERVICES].sort(() => Math.random() - 0.5);
      setLit(new Set(shuffled.slice(0, n).map((s) => s.name)));
      revertTimer.current = window.setTimeout(() => setLit(null), 5000);
    }, 450);
  }, [setLit]);

  useEffect(() => () => clearTimers(), []);

  return (
    <AppShell>
      <Box
        onMouseMove={onStageMouseMove}
        onMouseLeave={() => { clearTimers(); setLit(null); }}
        sx={{
          position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden',
          background: pal.stageBg,
          transition: 'background .3s',
          display: 'grid', placeItems: 'center',
          perspective: '1400px', perspectiveOrigin: '50% 45%',
          '@keyframes calypsoRise': {
            from: { opacity: 0, transform: 'translateY(14px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/*
          Back-most layer — a static chip/PCB illustration baked to one image.
          Everything painted over it below is static too: the only thing that
          animates on this page at all is the one-shot `sirenRise` on mount.
        */}
        <CircuitBackdrop pal={pal.circuit} />

        {/* aurora backdrop — plain radial gradients, no blur filter to rasterise */}
        <Box
          sx={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: pal.aurora,
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
            maskImage: pal.gridMask,
            WebkitMaskImage: pal.gridMask,
            pointerEvents: 'none',
            transition: 'background-image .3s',
          }}
        />

        {/* flow lines and service connectors — one SVG, no SMIL, no dash animation */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {/* lanes converging up into the wordmark */}
          {FLOW_PATHS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={pal.flowStroke}
              strokeWidth={0.28}
              strokeDasharray="1.6 1.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* each service card wired into the hub */}
          {HERO_SERVICES.map((svc) => {
            const dim = active !== null && !active.has(svc.name);
            return (
              <path
                key={svc.name}
                d={connectorPath(svc.x, svc.y)}
                fill="none"
                stroke={svc.connected ? pal.connLive : pal.connPending}
                strokeWidth={svc.connected ? 0.22 : 0.14}
                strokeDasharray={svc.connected ? '1.3 1.1' : '0.4 2.4'}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: dim ? 0.12 : 1, transition: 'opacity .5s ease' }}
              />
            );
          })}
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
                display: 'inline-block',
                fontFamily: FONT_DISPLAY, fontWeight: 800,
                fontSize: 'clamp(56px, 8vw, 112px)', lineHeight: 0.95, letterSpacing: '-.01em',
                color: pal.cardText,
                animation: 'calypsoRise .8s cubic-bezier(.2,.8,.3,1) both',
              }}
            >
              CALYPSO
            </Box>
            <Box
              sx={{
                width: 46, height: 3, borderRadius: 2, mx: 'auto', mt: '14px',
                background: pal.ctaBg,
                animation: 'calypsoRise .8s cubic-bezier(.2,.8,.3,1) .06s both',
              }}
            />
            <Box
              sx={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.38em',
                color: pal.subCopy, mt: '16px', pl: '.38em',
                animation: 'calypsoRise .8s cubic-bezier(.2,.8,.3,1) .12s both',
                transition: 'color .3s',
              }}
            >
              ARTIFACT REGISTRY
            </Box>
            <Box
              sx={{
                display: 'flex', justifyContent: 'center', mt: '34px',
                transformStyle: 'preserve-3d',
                animation: 'calypsoRise .8s cubic-bezier(.2,.8,.3,1) .24s both',
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
