import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useThemeMode } from '@/theme/ThemeModeContext';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';
import { useHubServices } from '@/hooks/useHubServices';

/**
 * 대문 — 산출물 서비스들이 바닥에 솔리드 슬랩으로 놓이고, 그 위에 반투명한 SIREN 판이
 * 떠 있는 3D 씬. 시각 기준은 리포지터리 루트의 `siren-orchestration-map.html`이며,
 * 설계서 §15.2에 따라 그 문서의 **3D 모델링 부분만** 가져왔다 — 설명 문구·범례·토글·
 * 경계 확인 패널·소유 규칙 패널은 전부 뺐다.
 *
 * 재질 대비가 곧 구조다: 아래는 불투명(실물 데이터를 소유), 위는 유리(참조만 관측).
 * 여기에 개념을 설명하는 문구는 한 줄도 두지 않는다 (§14.1).
 */

/** 카메라 각도 한계 — 이 범위를 벗어나면 슬랩 위 글자가 읽히지 않는다. */
const RX = { min: 16, max: 74, initial: 44 };
const RZ = { min: -46, max: 46, initial: -14 };

/** Z축 3단. 슬랩(0) → 계약 계층(150) → SIREN 판(292). 원본 맵과 같은 값이다. */
const Z_MEMBRANE = 150;
const Z_PLANE = 292;
const BEAM_H = Z_PLANE;

/** 슬랩 간격. 노드(172)·슬랩(206) 폭보다 넉넉해야 빔이 카드에 가리지 않는다. */
const SLOT_W = 231;
const MAX_SLABS = 4;

/** 개수와 무관하게 항상 가운데로 모은다 - 한 개만 등록돼 있어도 한쪽으로 쏠리지 않는다. */
function slotX(i: number, n: number): number {
  return (i - (n - 1) / 2) * SLOT_W;
}

interface Palette {
  stageBg: string;
  aurora: string;
  gridLine: string;
  gridMask: string;
  planeBorder: string;
  planeBg: string;
  planeShadow: string;
  planeLabel: string;
  nodeBg: string;
  nodeBorder: string;
  slabBg: string;
  slabBorder: string;
  slabRim: string;
  slabShadow: string;
  text: string;
  dim: string;
  dim2: string;
  chipBorder: string;
  observe: string;
  observeSoft: string;
  identity: string;
  identitySoft: string;
  ctaBg: string;
  ctaText: string;
  ctaShadow: string;
  ctaShadowHover: string;
}

const PALETTE: Record<'light' | 'dark', Palette> = {
  dark: {
    stageBg: '#0a0e14',
    aurora:
      'radial-gradient(120% 78% at 50% 96%, rgba(12,154,131,.10), transparent 62%),' +
      'radial-gradient(90% 60% at 50% 8%, rgba(123,126,232,.07), transparent 70%)',
    gridLine:
      'linear-gradient(rgba(27,35,46,1) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(27,35,46,1) 1px, transparent 1px)',
    gridMask: 'radial-gradient(58% 62% at 50% 50%, #000 32%, transparent 78%)',
    planeBorder: 'rgba(12,154,131,.5)',
    planeBg:
      'linear-gradient(160deg, rgba(12,154,131,.13), rgba(12,154,131,.04) 55%, rgba(10,14,20,.22))',
    planeShadow: '0 0 0 1px rgba(12,154,131,.10) inset, 0 26px 60px -30px rgba(12,154,131,.6)',
    planeLabel: '#7fe8d3',
    nodeBg: 'linear-gradient(180deg, rgba(19,32,38,.92), rgba(13,20,26,.9))',
    nodeBorder: 'rgba(12,154,131,.42)',
    slabBg: 'linear-gradient(178deg, #1d2733, #161e29 60%, #111823)',
    slabBorder: '#26313f',
    slabRim: 'linear-gradient(180deg, #0f151d, #0a0f16)',
    slabShadow: '0 30px 46px -26px rgba(0,0,0,.95)',
    text: '#e8edf4',
    dim: '#9aa5b6',
    dim2: '#67717f',
    chipBorder: '#26313f',
    observe: '#f0a23c',
    observeSoft: 'rgba(255,204,128,.95)',
    identity: '#7b7ee8',
    identitySoft: 'rgba(170,173,250,.85)',
    ctaBg: '#0c9a83',
    ctaText: '#ffffff',
    ctaShadow: '0 4px 12px rgba(0,0,0,.35)',
    ctaShadowHover: '0 7px 16px rgba(0,0,0,.42)',
  },
  light: {
    stageBg: '#eef1f5',
    aurora:
      'radial-gradient(120% 78% at 50% 96%, rgba(12,154,131,.10), transparent 62%),' +
      'radial-gradient(90% 60% at 50% 8%, rgba(90,94,180,.07), transparent 70%)',
    gridLine:
      'linear-gradient(rgba(190,199,211,1) 1px, transparent 1px),' +
      'linear-gradient(90deg, rgba(190,199,211,1) 1px, transparent 1px)',
    gridMask: 'radial-gradient(58% 62% at 50% 50%, #000 32%, transparent 78%)',
    planeBorder: 'rgba(12,120,103,.45)',
    planeBg:
      'linear-gradient(160deg, rgba(12,154,131,.12), rgba(12,154,131,.04) 55%, rgba(255,255,255,.5))',
    planeShadow: '0 0 0 1px rgba(12,154,131,.10) inset, 0 22px 44px -26px rgba(20,60,54,.4)',
    planeLabel: '#0a6d5e',
    nodeBg: 'linear-gradient(180deg, #ffffff, #f4f7f8)',
    nodeBorder: 'rgba(12,154,131,.4)',
    slabBg: 'linear-gradient(178deg, #ffffff, #f2f5f8 60%, #e8edf2)',
    slabBorder: '#ccd5de',
    slabRim: 'linear-gradient(180deg, #d9e0e7, #c3ccd6)',
    slabShadow: '0 22px 36px -24px rgba(30,45,65,.45)',
    text: '#101828',
    dim: '#667085',
    dim2: '#8b99ab',
    chipBorder: '#d6dde5',
    observe: '#c9781a',
    observeSoft: 'rgba(201,120,26,.9)',
    identity: '#5e61c4',
    identitySoft: 'rgba(94,97,196,.75)',
    ctaBg: '#0c7a68',
    ctaText: '#ffffff',
    ctaShadow: '0 4px 10px rgba(12,122,104,.2)',
    ctaShadowHover: '0 7px 14px rgba(12,122,104,.26)',
  },
};

export function HomePage() {
  const { mode } = useThemeMode();
  const pal = useMemo(() => PALETTE[mode], [mode]);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);

  /** 레지스트리에 실제로 등록된 서비스가 슬랩이 된다 (설계서 §15.4). */
  const { services } = useHubServices();
  const slabs = services.slice(0, MAX_SLABS);
  const n = Math.max(slabs.length, 1);
  const planeW = Math.max(460, n * SLOT_W + 70);

  const angles = useRef({ rx: RX.initial, rz: RZ.initial });
  const drag = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 });

  const apply = useCallback(() => {
    const el = cameraRef.current;
    if (!el) return;
    el.style.setProperty('--rx', `${angles.current.rx}deg`);
    el.style.setProperty('--rz', `${angles.current.rz}deg`);
  }, []);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const el = cameraRef.current;
    if (!stage || !el) return;
    // 워드마크가 위쪽을 차지하므로 씬이 쓸 수 있는 높이는 스테이지보다 작다.
    const byWidth = (stage.clientWidth - 48) / 1060;
    const byHeight = (stage.clientHeight - 220) / 520;
    const s = Math.max(0.34, Math.min(0.92, Math.min(byWidth, byHeight)));
    el.style.setProperty('--s', s.toFixed(3));
  }, []);

  useEffect(() => {
    fit();
    apply();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit, apply]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('a')) return;
    drag.current = { on: true, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const { rx, rz } = angles.current;
    angles.current = {
      rz: Math.max(RZ.min, Math.min(RZ.max, rz + (e.clientX - drag.current.x) * 0.28)),
      rx: Math.max(RX.min, Math.min(RX.max, rx - (e.clientY - drag.current.y) * 0.22)),
    };
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    apply();
  };
  const endDrag = () => {
    drag.current.on = false;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 4;
    const { rx, rz } = angles.current;
    if (e.key === 'ArrowLeft') angles.current.rz = Math.max(RZ.min, rz - step);
    else if (e.key === 'ArrowRight') angles.current.rz = Math.min(RZ.max, rz + step);
    else if (e.key === 'ArrowUp') angles.current.rx = Math.min(RX.max, rx + step);
    else if (e.key === 'ArrowDown') angles.current.rx = Math.max(RX.min, rx - step);
    else return;
    e.preventDefault();
    apply();
  };

  return (
    <AppShell>
      <Box
        ref={stageRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: pal.stageBg,
          backgroundImage: pal.aurora,
          perspective: '1600px',
          perspectiveOrigin: '50% 48%',
          touchAction: 'none',
          cursor: 'grab',
          outline: 'none',
          transition: 'background .3s',
          '&:active': { cursor: 'grabbing' },
          '@keyframes flowUp': { to: { backgroundPosition: '0 0, 0 -46px' } },
          '@keyframes flowDown': { to: { backgroundPosition: '0 0, 0 54px' } },
          '@keyframes sirenRise': {
            from: { opacity: 0, transform: 'translateY(14px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/*
          카메라. 이 아래 중간 래퍼에 opacity/filter를 걸면 3D가 평면으로 눌린다
          (설계서 §15.5, v2 부록 A.6) — 흐림이 필요하면 잎 요소에 직접 준다.
        */}
        <Box
          ref={cameraRef}
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            transformStyle: 'preserve-3d',
            transform:
              'translateY(var(--ty, 168px)) scale(var(--s,1)) rotateX(var(--rx,44deg)) rotateZ(var(--rz,-14deg))',
            transition: 'transform .12s linear',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {/* 바닥 그리드 */}
          <Box
            sx={{
              position: 'absolute',
              width: 1160,
              height: 560,
              ml: '-580px',
              mt: '-250px',
              transform: `translateZ(-34px)`,
              backgroundImage: pal.gridLine,
              backgroundSize: '58px 58px',
              maskImage: pal.gridMask,
              WebkitMaskImage: pal.gridMask,
              opacity: 0.62,
            }}
          />

          {/* SIREN 판 — 반투명 유리. 참조만 놓인다. */}
          <Box
            sx={{
              position: 'absolute',
              width: planeW,
              height: 250,
              ml: `${-planeW / 2}px`,
              mt: '-125px',
              transform: `translateZ(${Z_PLANE}px)`,
              transformStyle: 'preserve-3d',
              border: `1px dashed ${pal.planeBorder}`,
              borderRadius: '12px',
              background: pal.planeBg,
              boxShadow: pal.planeShadow,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: -30,
                left: 14,
                fontFamily: FONT_DISPLAY,
                fontSize: 15,
                fontWeight: 700,
                color: pal.planeLabel,
                whiteSpace: 'nowrap',
              }}
            >
              SIREN
            </Box>
            {slabs.map((s, i) => (
              <Box
                key={s.key}
                sx={{
                  position: 'absolute',
                  left: planeW / 2 + slotX(i, n) - 86,
                  top: 64,
                  width: 172,
                  p: '9px 11px',
                  borderRadius: '8px',
                  border: `1px solid ${pal.nodeBorder}`,
                  background: pal.nodeBg,
                  transformStyle: 'preserve-3d',
                }}
              >
                <Box sx={{ fontSize: 12.5, fontWeight: 600, color: pal.text, lineHeight: 1.25 }}>
                  {s.name}
                </Box>
                <Box
                  sx={{
                    mt: '6px',
                    pt: '5px',
                    borderTop: `1px dashed ${pal.chipBorder}`,
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    color: pal.dim2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.key}
                </Box>
              </Box>
            ))}
          </Box>

          {/* 계약 계층 */}
          <Box
            sx={{
              position: 'absolute',
              width: planeW,
              height: 74,
              ml: `${-planeW / 2}px`,
              mt: '-37px',
              transform: `translateZ(${Z_MEMBRANE}px)`,
              borderRadius: '10px',
              border: `1px solid ${pal.chipBorder}`,
              background:
                mode === 'dark'
                  ? 'linear-gradient(180deg, rgba(22,30,41,.72), rgba(13,18,25,.55))'
                  : 'linear-gradient(180deg, rgba(255,255,255,.8), rgba(240,244,248,.6))',
            }}
          />

          {/* 서비스 슬랩 — 불투명 솔리드. 실물 데이터가 여기 있다. */}
          {slabs.map((s, i) => (
            <Box
              key={s.key}
              sx={{
                position: 'absolute',
                left: slotX(i, n) - 103,
                top: -96,
                width: 206,
                p: '12px 13px 14px',
                borderRadius: '9px',
                background: pal.slabBg,
                border: `1px solid ${pal.slabBorder}`,
                borderBottom: 'none',
                boxShadow: pal.slabShadow,
                transformStyle: 'preserve-3d',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  left: -1,
                  right: -1,
                  top: '100%',
                  height: 22,
                  background: pal.slabRim,
                  border: `1px solid ${pal.slabBorder}`,
                  borderTop: 'none',
                  borderRadius: '0 0 9px 9px',
                  transformOrigin: '50% 0',
                  transform: 'rotateX(-90deg)',
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  pb: '9px',
                  borderBottom: `1px solid ${pal.chipBorder}`,
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    flex: 'none',
                    background: s.enabled ? pal.ctaBg : pal.dim2,
                    boxShadow: s.enabled ? `0 0 8px ${pal.ctaBg}` : 'none',
                  }}
                />
                <Box sx={{ fontSize: 13.5, fontWeight: 700, color: pal.text }}>{s.name}</Box>
                <Box
                  sx={{
                    ml: 'auto',
                    fontFamily: FONT_MONO,
                    fontSize: 9,
                    color: pal.dim2,
                    border: `1px solid ${pal.chipBorder}`,
                    borderRadius: '3px',
                    p: '1px 5px',
                  }}
                >
                  {s.contractVersion}
                </Box>
              </Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: pal.dim, mt: '9px' }}>
                {s.transport}
              </Box>
              <Box sx={{ fontSize: 12.5, fontWeight: 600, color: pal.text, mt: '4px', lineHeight: 1.3 }}>
                {s.key}
              </Box>
            </Box>
          ))}

          {/* 빔 — 위로 흐르는 관측, 아래로 흐르는 공용 데이터.
              rotateX(90deg)여야 위로 뻗는다. 부호를 반대로 주면 바닥 아래로 간다(§15.5). */}
          {slabs.map((s, i) => (
            <Box
              key={s.key}
              sx={{ position: 'absolute', left: slotX(i, n), top: 24, width: 0, height: 0, transformStyle: 'preserve-3d' }}
            >
              {(['a', 'b'] as const).map((face) => (
                <Box
                  key={`up-${face}`}
                  sx={{
                    position: 'absolute',
                    width: 14,
                    height: BEAM_H,
                    ml: '-20px',
                    borderRadius: '2px',
                    transformOrigin: '50% 0',
                    transform: face === 'a' ? 'rotateX(90deg)' : 'rotateX(90deg) rotateY(90deg)',
                    pointerEvents: 'none',
                    background: `linear-gradient(180deg, ${hexA(pal.observe, 0.1)} 0%, ${hexA(pal.observe, 0.55)} 55%, ${hexA(pal.observe, 0.16)} 100%),
                      repeating-linear-gradient(0deg, ${pal.observeSoft} 0 11px, transparent 11px 46px)`,
                    backgroundSize: '100% 100%, 100% 46px',
                    boxShadow: `0 0 26px ${hexA(pal.observe, 0.5)}`,
                    animation: 'flowUp 1.9s linear infinite',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              ))}
              {(['a', 'b'] as const).map((face) => (
                <Box
                  key={`dn-${face}`}
                  sx={{
                    position: 'absolute',
                    width: 8,
                    height: BEAM_H,
                    ml: '13px',
                    borderRadius: '2px',
                    transformOrigin: '50% 0',
                    transform: face === 'a' ? 'rotateX(90deg)' : 'rotateX(90deg) rotateY(90deg)',
                    pointerEvents: 'none',
                    background: `linear-gradient(180deg, ${hexA(pal.identity, 0.45)} 0%, ${hexA(pal.identity, 0.1)} 96%),
                      repeating-linear-gradient(0deg, ${pal.identitySoft} 0 7px, transparent 7px 54px)`,
                    backgroundSize: '100% 100%, 100% 54px',
                    boxShadow: `0 0 18px ${hexA(pal.identity, 0.42)}`,
                    animation: 'flowDown 2.6s linear infinite',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              ))}
            </Box>
          ))}
        </Box>

        {/* 워드마크는 3D 밖에 둔다 — 카메라를 돌려도 읽혀야 한다. */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'clamp(24px, 8%, 72px)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(44px, 6.5vw, 88px)',
              lineHeight: 0.95,
              letterSpacing: '-.01em',
              color: pal.text,
              animation: 'sirenRise .8s cubic-bezier(.2,.8,.3,1) both',
            }}
          >
            SIREN
          </Box>
          <Box
            sx={{
              width: 46,
              height: 3,
              borderRadius: 2,
              mx: 'auto',
              mt: '14px',
              background: pal.ctaBg,
              animation: 'sirenRise .8s cubic-bezier(.2,.8,.3,1) .06s both',
            }}
          />
          <Box
            sx={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: '.38em',
              color: pal.dim,
              mt: '16px',
              pl: '.38em',
              animation: 'sirenRise .8s cubic-bezier(.2,.8,.3,1) .12s both',
            }}
          >
            SENSOR DESIGN WORKFLOW
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mt: '28px',
              pointerEvents: 'auto',
              animation: 'sirenRise .8s cubic-bezier(.2,.8,.3,1) .24s both',
            }}
          >
            <Box
              component={Link}
              to="/projects"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                p: '11px 24px',
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                color: pal.ctaText,
                background: pal.ctaBg,
                boxShadow: pal.ctaShadow,
                transition: 'transform .18s ease, box-shadow .18s ease',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: pal.ctaShadowHover },
              }}
            >
              View Projects
            </Box>
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}

/** #rrggbb + 알파 → rgba(). 팔레트를 한 벌만 두고 빔의 농도만 바꾸려고 쓴다. */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
