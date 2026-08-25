import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useThemeMode } from '@/theme/ThemeModeContext';

/**
 * Total workflow view 전용 "적당히 우주스러운" 배경 — HomePage의 aurora/grid 패턴
 * (theme별 rgba를 명시하는 PALETTE 방식)을 그대로 따른다. 도메인 카드 자체는 항상
 * 불투명(T.sf)이라 데이터 가독성엔 영향이 없고, 카드 사이 여백·상단바·좌측 메뉴에만
 * 옅은 오로라 + 별 점이 비친다.
 */
export interface SpacePalette {
  /** 페이지 바탕 — Dialog Paper와 보드 루트가 함께 쓴다. */
  wash: string;
  aurora: string;
  star: string;
  starBright: string;
  /** 상단바/좌측 메뉴의 반투명 유리판 배경. */
  panelBg: string;
  panelBorder: string;
}

const SPACE_PALETTE: Record<'light' | 'dark', SpacePalette> = {
  dark: {
    wash: '#0a0d15',
    aurora:
      'radial-gradient(58% 44% at 20% 12%, rgba(46,230,197,.06), transparent 70%),'
      + 'radial-gradient(54% 48% at 84% 80%, rgba(154,139,255,.055), transparent 72%)',
    star: 'rgba(210,225,255,.5)',
    starBright: 'rgba(255,255,255,.85)',
    panelBg: 'rgba(16,20,30,.74)',
    panelBorder: 'rgba(150,170,210,.14)',
  },
  light: {
    wash: '#eef1f7',
    aurora:
      'radial-gradient(58% 44% at 20% 12%, rgba(12,154,131,.07), transparent 70%),'
      + 'radial-gradient(54% 48% at 84% 80%, rgba(88,73,207,.06), transparent 72%)',
    // 라이트 배경 위 별은 밝은 점이 아니라 옅은 잉크 반점처럼 보여야 해서, 다크보다
    // 알파를 훨씬 높게 잡는다 — 그래야 "은은하게라도 우주" 정도로 눈에 들어온다.
    star: 'rgba(50,68,102,.34)',
    starBright: 'rgba(38,54,88,.55)',
    panelBg: 'rgba(255,255,255,.74)',
    panelBorder: 'rgba(20,32,47,.09)',
  },
};

export function useSpacePalette(): SpacePalette {
  const { mode } = useThemeMode();
  return useMemo(() => SPACE_PALETTE[mode], [mode]);
}

interface Star {
  id: number;
  x: number;
  y: number;
  r: number;
  o: number;
  delay: number;
}

/** 결정적 PRNG(mulberry32) — 새로고침해도 별자리가 안 바뀐다. */
function seededStars(seed: number, count: number, w: number, h: number): Star[] {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i, x: rnd() * w, y: rnd() * h, r: 0.5 + rnd() * 1.1, o: 0.3 + rnd() * 0.5, delay: rnd() * 6,
  }));
}

const FIELD_W = 1600;
const FIELD_H = 1400;

/**
 * 뷰포트 크기의 고정 배경 — 스크롤 콘텐츠(도메인 섹션들)와는 별개로 보드 루트에
 * 딱 한 번만 깔린다. 스크롤에 따라 아주 살짝(수 %) 시차 이동해 "천천히 흘러가는"
 * 느낌만 준다 — 콘텐츠를 따라 크게 움직이면 오히려 산만해지므로 진폭은 작게 유지.
 */
export function SpaceBackdrop({ scrollRef }: { scrollRef: React.RefObject<HTMLElement> }) {
  const pal = useSpacePalette();
  const layerA = useRef<HTMLDivElement | null>(null);
  const layerB = useRef<HTMLDivElement | null>(null);
  const starsA = useMemo(() => seededStars(11, 70, FIELD_W, FIELD_H), []);
  const starsB = useMemo(() => seededStars(29, 30, FIELD_W, FIELD_H), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = el.scrollTop;
        if (layerA.current) layerA.current.style.transform = `translate3d(0, ${-t * 0.025}px, 0)`;
        if (layerB.current) layerB.current.style.transform = `translate3d(0, ${-t * 0.06}px, 0)`;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [scrollRef]);

  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', background: pal.wash }}>
      <Box sx={{ position: 'absolute', inset: 0, background: pal.aurora }} />
      <Box ref={layerA} sx={{ position: 'absolute', inset: '-12% 0', willChange: 'transform' }}>
        <svg width="100%" height="124%" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMin slice">
          {starsA.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r={s.r} fill={pal.star} opacity={s.o} />)}
        </svg>
      </Box>
      <Box ref={layerB} sx={{ position: 'absolute', inset: '-12% 0', willChange: 'transform' }}>
        <svg width="100%" height="124%" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMin slice">
          {starsB.map((s) => (
            <circle
              key={s.id}
              cx={s.x}
              cy={s.y}
              r={s.r * 1.5}
              fill={pal.starBright}
              opacity={s.o * 0.7}
              className="wf-twinkle"
              style={{ animationDelay: `${s.delay}s` }}
            />
          ))}
        </svg>
      </Box>
    </Box>
  );
}
