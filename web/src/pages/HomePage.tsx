import { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { FONT_DISPLAY, FONT_MONO } from '@/theme/tokens';

/** 3D 무대에 띄울 산출물 카드 — 워드마크를 감싸도록 좌우로 벌려 배치한다(x/y/z, r=회전). */
const CARDS = [
  { t: 'PLL 요구사양서', s: 'REQ · v2.1', x: -500, y: -235, z: 210, r: 16, d: 0, c: '#2ee6c5' },
  { t: 'Bandgap 회로도', s: 'SCH · v1.4', x: -540, y: 95, z: 90, r: 20, d: 0.7, c: '#7c8cff' },
  { t: 'LDO 특성 리포트', s: 'RPT · v3.0', x: 500, y: -250, z: 130, r: -18, d: 1.3, c: '#ffb45e' },
  { t: 'ADC 검증 결과', s: 'VER · v1.0', x: 545, y: 75, z: 230, r: -22, d: 1.9, c: '#2ee6c5' },
  { t: 'HLD Release', s: 'REL · v4.2', x: -30, y: 265, z: 290, r: 0, d: 2.5, c: '#ff6f91' },
];

const LANES = ['CONCEPT', 'DESIGN', 'VERIFY', 'TAPE-OUT'];

/**
 * 랜딩 히어로 — 시스템 설명 카드 없이 3D 연출만으로 채운다.
 * 마우스 위치를 CSS 변수(--mx/--my)로 흘려보내 무대 전체가 기울어지는 패럴랙스를 만든다.
 */
export function HomePage() {
  const { data: users } = useUsers();
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
          background: '#070b14',
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
        {/* 배경 오로라 */}
        <Box
          sx={{
            position: 'absolute', inset: '-30%', pointerEvents: 'none',
            background:
              'radial-gradient(48% 42% at 24% 28%, rgba(46,230,197,.42), transparent 62%),' +
              'radial-gradient(46% 40% at 78% 64%, rgba(124,140,255,.46), transparent 64%),' +
              'radial-gradient(38% 34% at 52% 92%, rgba(255,111,145,.30), transparent 66%)',
            filter: 'blur(14px)',
            animation: 'acroGlow 9s ease-in-out infinite',
          }}
        />

        {/* 3D 그리드 바닥 */}
        <Box
          sx={{
            position: 'absolute', left: '-40%', right: '-40%', bottom: '-24%', height: '78%',
            transformOrigin: '50% 100%',
            transform: 'rotateX(74deg)',
            backgroundImage:
              'linear-gradient(rgba(46,230,197,.55) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(124,140,255,.42) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
            animation: 'acroDrift 6s linear infinite',
            maskImage: 'linear-gradient(to top, #000 2%, transparent 72%)',
            WebkitMaskImage: 'linear-gradient(to top, #000 2%, transparent 72%)',
            pointerEvents: 'none',
          }}
        />

        {/* 무대 */}
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
          {/* 레인 판 — 캔버스의 Phase 레인을 3D로 세운 것 */}
          <Box
            sx={{
              position: 'absolute', display: 'flex', gap: '18px',
              transform: 'translateZ(-320px)',
              opacity: 0.5,
            }}
          >
            {LANES.map((l, i) => (
              // 배치(translateZ)와 부유 애니메이션(transform)이 서로를 덮어쓰지 않도록 두 겹으로 나눈다.
              <Box key={l} sx={{ transform: `translateZ(${i * 26}px)`, transformStyle: 'preserve-3d' }}>
                <Box
                  sx={{
                    width: 190, height: 300, borderRadius: '14px',
                    border: '1px solid rgba(124,140,255,.42)',
                    background: 'linear-gradient(160deg, rgba(124,140,255,.20), rgba(46,230,197,.07))',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '14px',
                    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.22em',
                    color: 'rgba(180,206,255,.75)',
                    animation: `acroFloat ${7 + i * 0.7}s ease-in-out ${i * 0.4}s infinite`,
                  }}
                >
                  {l}
                </Box>
              </Box>
            ))}
          </Box>

          {/* 떠 있는 산출물 카드 */}
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
                  background: 'linear-gradient(150deg, rgba(31,48,78,.96), rgba(13,22,40,.92))',
                  border: `1px solid ${c.c}55`,
                  boxShadow: `0 30px 70px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.14), 0 0 40px ${c.c}33`,
                  color: '#eaf2ff',
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
                    color: 'rgba(180,206,255,.7)', mt: '5px',
                  }}
                >
                  {c.s}
                </Box>
              </Box>
            </Box>
          ))}

          {/* 워드마크 */}
          <Box sx={{ position: 'relative', textAlign: 'center', transform: 'translateZ(190px)' }}>
            <Box
              sx={{
                fontFamily: FONT_DISPLAY, fontWeight: 800,
                fontSize: 'clamp(72px, 12vw, 178px)', lineHeight: 0.86, letterSpacing: '-.045em',
                background: 'linear-gradient(178deg,#ffffff 8%,#b7f5e6 42%,#7c8cff 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                filter:
                  'drop-shadow(0 24px 46px rgba(46,230,197,.34)) drop-shadow(0 4px 0 rgba(124,140,255,.30))',
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) both',
              }}
            >
              ACRO
            </Box>
            <Box
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.44em',
                color: 'rgba(180,206,255,.82)', mt: '14px', pl: '.44em',
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) .12s both',
              }}
            >
              CIS DELIVERABLE CONTROL
            </Box>

            <Box
              sx={{
                display: 'flex', gap: '12px', justifyContent: 'center', mt: '34px',
                transformStyle: 'preserve-3d',
                animation: 'acroRise .8s cubic-bezier(.2,.8,.3,1) .24s both',
              }}
            >
              <HeroLink to="/projects" primary>프로젝트 목록</HeroLink>
              <HeroLink to="/details">보드 바로가기</HeroLink>
            </Box>
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}

function HeroLink({ to, primary, children }: { to: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '12px 24px', borderRadius: '11px',
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
        transition: 'transform .22s cubic-bezier(.2,.8,.3,1), box-shadow .22s',
        ...(primary
          ? {
              color: '#04140f',
              background: 'linear-gradient(150deg,#8ffbe2,#2ee6c5 60%,#12b7a4)',
              boxShadow: '0 14px 34px rgba(46,230,197,.42), inset 0 1px 0 rgba(255,255,255,.65)',
            }
          : {
              color: '#dce7ff',
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.24)',
              boxShadow: '0 12px 28px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.16)',
            }),
        '&:hover': {
          transform: 'translateZ(28px) translateY(-3px)',
          boxShadow: primary
            ? '0 22px 48px rgba(46,230,197,.55), inset 0 1px 0 rgba(255,255,255,.7)'
            : '0 20px 40px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.22)',
        },
      }}
    >
      {children}
    </Box>
  );
}
