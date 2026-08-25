import { useMemo } from 'react';
import { Box } from '@mui/material';
import { useThemeMode } from '@/theme/ThemeModeContext';

/**
 * Design Workflow view의 "적당히 우주스러운" 배경 — HomePage의 aurora 배경과 같은
 * 방식(useThemeMode() + theme별 명시적 rgba 팔레트)을 따른다.
 *
 * 카메라(translate+scale)를 따라 시차(parallax)로 움직인다. 별 레이어는 카메라
 * 이동량의 일부만 따라가고 줌에는 아주 약하게만 반응해서, 판이 움직일 때 배경이
 * "훨씬 먼 곳"처럼 느리게 흐른다.
 */
export interface SpacePalette {
  /** 페이지 바탕. */
  wash: string;
  aurora: string;
  star: string;
  starBright: string;
  /** 상단바/좌측 메뉴의 반투명 유리판 — 화면에서 유일하게 남은 "패널" 크롬이다.
   * 도메인/Phase는 판(plate)이 아예 없으므로 그쪽엔 배경색이 필요 없다. */
  panelBg: string;
  panelBorder: string;
}

const SPACE_PALETTE: Record<'light' | 'dark', SpacePalette> = {
  dark: {
    wash: '#070a12',
    aurora:
      'radial-gradient(58% 40% at 18% 10%, rgba(46,230,197,.07), transparent 70%),'
      + 'radial-gradient(52% 44% at 86% 78%, rgba(154,139,255,.065), transparent 72%),'
      + 'radial-gradient(44% 36% at 60% 44%, rgba(74,163,255,.045), transparent 70%)',
    star: 'rgba(210,225,255,.55)',
    starBright: 'rgba(255,255,255,.9)',
    panelBg: 'rgba(14,19,30,.78)',
    panelBorder: 'rgba(150,170,210,.16)',
  },
  // 라이트 테마는 "우주"가 아니라 HomePage 라이트 테마(흰 배경 + 옅은 청회색
  // aurora)를 그대로 가져온다 — 별/성운은 어두운 배경에서만 성립하는 은유라
  // 밝은 화면에서 억지로 흉내 내면 지저분해질 뿐이다(요청). 별은 SpaceBackdrop이
  // mode==='dark'일 때만 그린다.
  light: {
    wash: '#f4f6f9',
    aurora:
      'radial-gradient(60% 50% at 28% 22%, rgba(92,124,158,.11), transparent 70%),'
      + 'radial-gradient(55% 46% at 76% 72%, rgba(82,104,144,.09), transparent 72%)',
    star: 'transparent',
    starBright: 'transparent',
    panelBg: 'rgba(255,255,255,.8)',
    panelBorder: 'rgba(20,32,47,.1)',
  },
};

export function useSpacePalette(): SpacePalette {
  const { mode } = useThemeMode();
  return useMemo(() => SPACE_PALETTE[mode], [mode]);
}

/** 결정적 PRNG(mulberry32) — 새로고침해도 별자리가 그대로다. */
function seededStars(seed: number, count: number, w: number, h: number) {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i, x: rnd() * w, y: rnd() * h, r: 0.5 + rnd() * 1.2, o: 0.3 + rnd() * 0.55, delay: rnd() * 7,
  }));
}

const FIELD_W = 2200;
const FIELD_H = 1500;

/**
 * 카메라를 따라 시차로 흐르는 별 배경.
 * @param camX,camY 카메라 translate(px) — 레이어마다 계수를 달리해 깊이를 만든다.
 * @param camZ 카메라 배율 — 별은 아주 약하게만(1에 수렴) 반응시켜 멀리 있는 느낌을 유지.
 */
export function SpaceBackdrop({ camX, camY, camZ }: { camX: number; camY: number; camZ: number }) {
  const pal = useSpacePalette();
  const { mode } = useThemeMode();
  const layers = useMemo(
    () => [
      { stars: seededStars(11, 150, FIELD_W, FIELD_H), p: 0.03, s: 1, bright: false },
      { stars: seededStars(29, 70, FIELD_W, FIELD_H), p: 0.075, s: 1.35, bright: false },
      { stars: seededStars(47, 26, FIELD_W, FIELD_H), p: 0.14, s: 1.9, bright: true },
    ],
    [],
  );
  // 줌이 변해도 별 크기는 거의 그대로 — 1에서 살짝만 벗어나게 눌러 준다.
  const starScale = 1 + (camZ - 1) * 0.12;

  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: pal.wash }}>
      <Box sx={{ position: 'absolute', inset: 0, background: pal.aurora }} />
      {mode === 'dark' && layers.map((l, i) => (
        <Box
          key={i}
          sx={{ position: 'absolute', inset: '-25%', willChange: 'transform' }}
          style={{ transform: `translate3d(${camX * l.p}px, ${camY * l.p}px, 0) scale(${starScale})` }}
        >
          <svg width="100%" height="100%" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid slice">
            {l.stars.map((s) => (
              <circle
                key={s.id}
                cx={s.x}
                cy={s.y}
                r={s.r * l.s}
                fill={l.bright ? pal.starBright : pal.star}
                opacity={s.o}
                {...(l.bright
                  ? { className: 'dw-twinkle', style: { animationDelay: `${s.delay}s` } }
                  : {})}
              />
            ))}
          </svg>
        </Box>
      ))}
    </Box>
  );
}
