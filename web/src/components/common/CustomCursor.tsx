import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/theme/useReducedMotion';

/**
 * SIREN 전용 커서 — 기본 화살표 / 클릭 가능(손가락 + 파동) / 비활성(not-allowed) 세 모습을
 * 실제로 움직이는 DOM 요소로 그린다.
 *
 * ★ 왜 `cursor: url(...)`가 아니라 이런 컴포넌트인가 — 브라우저의 `cursor` 속성은 이미지
 *   한 장만 보여준다. SVG 안에 `<animate>`나 CSS keyframes를 넣어도 커서로 쓰이는 순간
 *   첫 프레임만 찍혀 정지한다(Chrome·Firefox·Safari 전부 동일). "클릭 가능한 지점 위로
 *   음파가 실제로 퍼지는" 요구는 네이티브 커서를 완전히 숨기고 마우스를 따라다니는 이
 *   컴포넌트로만 가능하다.
 * ★ 어디서 판정하는가 — 마우스 아래 요소의 **계산된(computed) cursor 값**을 읽는다.
 *   `a, button:not(:disabled)` 등 62곳 넘게 흩어진 기존 CURSOR_POINTER 사용처를 전부
 *   찾아다니며 클래스를 달지 않아도, index.html의 전역 규칙이 이미 매겨 둔 "이 자리는
 *   pointer.svg다 / disabled.svg다 / text다"라는 판정을 그대로 재사용하는 것이다.
 *   그 계산된 값에 맞춰 커서를 `none`으로 죽이고 이 컴포넌트가 그 자리를 대신 그린다.
 *   text 입력 위에서는 아예 그리지 않는다 — 네이티브 텍스트 빔이 계속 보여야 한다.
 * ★ 터치 기기에는 켜지 않는다(`pointer: coarse`) — 애초에 커서가 없는 환경이다.
 * ★ 창 밖으로 나가면 커서와 파동을 **하나의 visible 상태로 묶어 동시에** 끈다. 프리뷰
 *   데모에서 커서 아이콘만 치우고 파동 wrapper는 그대로 둬서 화면 끝에 파동이 눌어붙는
 *   버그가 있었다 — 그 원인이 "따로 관리되는 두 개의 가시성 상태"였다.
 */

type Mode = 'default' | 'pointer' | 'disabled' | 'native';

const SIZE = 32;
/** 화살촉 hotspot — public/cursors/default.svg, index.html의 전역 규칙과 같은 값. */
const DEFAULT_HOTSPOT = { x: 9, y: 8 };
/** 손끝 hotspot — public/cursors/pointer.svg, tokens.ts의 CURSOR_POINTER와 같은 값. */
const POINTER_HOTSPOT = { x: 12, y: 5 };
const DISABLED_HOTSPOT = { x: 16, y: 16 };

/** default.svg(index.html의 회전 다각형 arrow)와 동일한 외곽선 — 컴포넌트에서는 이 하나만 쓴다. */
const ARROW_D =
  'M9.97 8.86 L9.97 8.86 Q9.00 8.00 9.00 9.30 L9.00 22.94 Q9.00 24.24 9.95 23.35 L12.15 21.27 ' +
  'Q13.10 20.38 13.63 21.57 L15.44 25.67 Q15.97 26.86 17.17 26.35 L17.48 26.22 Q18.68 25.71 18.16 24.52 ' +
  'L16.41 20.51 Q15.89 19.32 17.18 19.20 L19.93 18.94 Q21.22 18.82 20.25 17.96 Z';

function classify(el: Element | null): Mode {
  if (!el) return 'default';
  const cs = getComputedStyle(el).cursor;
  if (cs.includes('pointer.svg')) return 'pointer';
  if (cs.includes('disabled.svg') || cs === 'not-allowed') return 'disabled';
  if (cs === 'text') return 'native';
  return 'default';
}

/** 손·화살표·not-allowed 공통 껍데기 — 흰 글로우(배경 분리) + 드롭섀도를 한 번만 정의한다. */
function GlowDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" x1="6" y1="4" x2="20" y2="30">
        <stop offset="0" stopColor="var(--s-cursor-0)" />
        <stop offset="1" stopColor="var(--s-cursor-1)" />
      </linearGradient>
      <radialGradient id={`${id}-gloss`} cx="0.4" cy="0.15" r="0.6">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <filter id={`${id}-drop`} x="-80%" y="-80%" width="260%" height="260%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#0b0f1c" floodOpacity="0.42" />
      </filter>
    </defs>
  );
}

function ArrowGlyph() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 32 32">
      <GlowDefs id="ar" />
      <path d={ARROW_D} fill="#ffffff" opacity={0.85} filter="url(#ar-glow)" />
      <g filter="url(#ar-drop)">
        <path d={ARROW_D} fill="url(#ar-body)" />
        <g clipPath="url(#ar-clip)">
          <ellipse cx="12.5" cy="12" rx="6" ry="8" fill="var(--s-cursor-top)" opacity="0.35" />
          <ellipse cx="11" cy="10.5" rx="3.4" ry="4.6" fill="url(#ar-gloss)" />
        </g>
      </g>
      <clipPath id="ar-clip">
        <path d={ARROW_D} />
      </clipPath>
    </svg>
  );
}

/** 손 세 덩이(검지·주먹·엄지) — 예전 시안에서 "검지가 비정상적으로 크다"는 지적을 받고
 *  손가락 폭을 8→6, 그마저 안쪽으로 더 가늘게(rx=3) 잡아 표준적인 "가리키는 손" 비율로 고쳤다. */
const FINGER = { x: 9, y: 5, w: 6, h: 17, rx: 3 };
const FIST = { x: 8.5, y: 20.5, w: 12, h: 8.8, rx: 4.6 };
const THUMB = { x: 4, y: 21.2, w: 6.6, h: 4.9, rx: 2.4 };

function PointerGlyph({ reducedMotion }: { reducedMotion: boolean }) {
  const thumbCx = THUMB.x + THUMB.w / 2;
  const thumbCy = THUMB.y + THUMB.h / 2;
  const waveCx = FINGER.x + FINGER.w / 2;

  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 32 32" style={{ overflow: 'visible' }}>
      <GlowDefs id="pt" />
      <g fill="#ffffff" opacity={0.85} filter="url(#pt-glow)">
        <rect x={FINGER.x} y={FINGER.y} width={FINGER.w} height={FINGER.h} rx={FINGER.rx} />
        <rect x={FIST.x} y={FIST.y} width={FIST.w} height={FIST.h} rx={FIST.rx} />
        <rect
          x={THUMB.x} y={THUMB.y} width={THUMB.w} height={THUMB.h} rx={THUMB.rx}
          transform={`rotate(-14 ${thumbCx} ${thumbCy})`}
        />
      </g>
      <g filter="url(#pt-drop)">
        <rect x={FIST.x} y={FIST.y} width={FIST.w} height={FIST.h} rx={FIST.rx} fill="url(#pt-body)" />
        <rect
          x={THUMB.x} y={THUMB.y} width={THUMB.w} height={THUMB.h} rx={THUMB.rx} fill="url(#pt-body)"
          transform={`rotate(-14 ${thumbCx} ${thumbCy})`}
        />
        <rect x={FINGER.x} y={FINGER.y} width={FINGER.w} height={FINGER.h} rx={FINGER.rx} fill="url(#pt-body)" />
        <ellipse cx={FINGER.x + FINGER.w * 0.38} cy={FINGER.y + FINGER.h * 0.32} rx={FINGER.w * 0.32} ry={FINGER.h * 0.3} fill="var(--s-cursor-top)" opacity="0.4" />
        <ellipse cx={FINGER.x + FINGER.w * 0.32} cy={FINGER.y + FINGER.h * 0.2} rx={FINGER.w * 0.22} ry={FINGER.h * 0.17} fill="url(#pt-gloss)" />
        <path
          d={`M${FINGER.x + 1} ${FINGER.y + FINGER.h - 3} Q${waveCx} ${FINGER.y + FINGER.h + 1} ${FINGER.x + FINGER.w - 1} ${FINGER.y + FINGER.h - 3}`}
          fill="none" stroke="var(--s-cursor-rim)" strokeWidth="0.8" strokeLinecap="round" opacity="0.4"
        />
      </g>

      {/* 클릭 지점 음파 — 손끝(hotspot) 위로 실제로 커지며 사라지는 링 3겹.
          reducedMotion이면 애니메이션 없이 옅은 고정 호 하나만 남긴다. */}
      {reducedMotion ? (
        <path
          d={`M${waveCx - 4.6} ${FINGER.y - 2.7} A6.2 8 0 0 1 ${waveCx + 4.6} ${FINGER.y - 2.7}`}
          fill="none" stroke="var(--s-cursor-0)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"
        />
      ) : (
        [0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={POINTER_HOTSPOT.x}
            cy={POINTER_HOTSPOT.y}
            r={2}
            fill="none"
            stroke="var(--s-cursor-0)"
            strokeWidth="1.3"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 2.6], opacity: [0, 0.75, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.55, ease: 'easeOut' }}
            style={{ transformOrigin: `${POINTER_HOTSPOT.x}px ${POINTER_HOTSPOT.y}px` }}
          />
        ))
      )}
    </svg>
  );
}

function DisabledGlyph() {
  const cx = 16, cy = 16, r = 9.5, sw = 2.6;
  const d = r * Math.cos(Math.PI / 4);
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 32 32">
      <defs>
        <filter id="dis-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
        <filter id="dis-drop" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.9" floodColor="#0b0f1c" floodOpacity="0.35" />
        </filter>
      </defs>
      <g fill="none" stroke="#ffffff" opacity={0.85} filter="url(#dis-glow)">
        <circle cx={cx} cy={cy} r={r} strokeWidth={sw + 2.6} />
        <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} strokeWidth={sw + 2.6} strokeLinecap="round" />
      </g>
      <g fill="none" stroke="var(--s-dm)" filter="url(#dis-drop)">
        <circle cx={cx} cy={cy} r={r} strokeWidth={sw} />
        <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} strokeWidth={sw} strokeLinecap="round" />
      </g>
    </svg>
  );
}

const HOTSPOT: Record<Exclude<Mode, 'native'>, { x: number; y: number }> = {
  default: DEFAULT_HOTSPOT,
  pointer: POINTER_HOTSPOT,
  disabled: DISABLED_HOTSPOT,
};

export function CustomCursor() {
  const reducedMotion = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('default');
  const [visible, setVisible] = useState(false);
  const [coarse, setCoarse] = useState(true);
  // StrictMode 이중 렌더에서도 안전하게 mount 여부를 판정하려고 portal 대상을 state로 둔다.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(pointer: coarse)');
    setCoarse(mq.matches);
    const onMq = () => setCoarse(mq.matches);
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  /**
   * 호버된 요소 — "읽은 다음에만" 그 요소에 인라인으로 cursor:none을 건다.
   *
   * ★ 처음에는 `html.siren-custom-cursor * { cursor: none !important }` 같은 전역
   *   규칙으로 네이티브 커서를 죽이려 했는데, 그러면 CURSOR_POINTER를 쓰는 62곳의
   *   판정 자체가 불가능해진다 — getComputedStyle이 이미 내가 덮어쓴 'none'을
   *   돌려주기 때문이다("무엇이었는지"를 읽는 순간 이미 내가 지워버린 뒤다).
   *   특이도를 아무리 손봐도 "같은 속성으로 읽기와 가리기를 동시에 한다"는
   *   모순은 못 없앤다. 그래서 순서를 바꾼다: 마우스 아래 요소가 바뀔 때마다
   *   ① 아직 아무것도 안 건드린 상태에서 그 요소의 원래 cursor를 읽어 분류하고,
   *   ② 그 다음에야 **그 요소 하나에만** 인라인 스타일로 cursor:none을 건다.
   *   이러면 index.html이나 62곳 어디도 고칠 필요가 없다 — 이미 선언되어 있는
   *   cursor 값을 훔쳐보기만 하고, 아주 짧은 순간 뒤에 그 자리만 가린다.
   */
  /** 마지막으로 본 요소 — 같은 요소 위에서 계속 움직이는 동안 재분류를 건너뛴다. */
  const lastElRef = useRef<Element | null>(null);
  /** 그중 실제로 인라인 cursor:none을 걸어 둔 요소 — 되돌릴 대상은 이쪽만이다. */
  const hoveredRef = useRef<(HTMLElement | SVGElement) | null>(null);

  const restoreHovered = () => {
    hoveredRef.current?.style.removeProperty('cursor');
    hoveredRef.current = null;
  };

  useEffect(() => {
    if (coarse) return undefined;

    let scheduled = false;
    let lastX = 0;
    let lastY = 0;

    const apply = () => {
      scheduled = false;
      if (wrapRef.current) {
        wrapRef.current.style.transform = `translate3d(${lastX}px, ${lastY}px, 0)`;
      }
    };

    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(apply);
      }
      setVisible(true);

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el === lastElRef.current) return; // 같은 요소 위에서 계속 움직이는 중 — 다시 읽을 것 없다
      lastElRef.current = el;
      restoreHovered();
      if (el instanceof HTMLElement || el instanceof SVGElement) {
        const m = classify(el); // ① 아직 건드리기 전 — 원래 값을 그대로 읽는다
        setMode(m);
        // text 입력 위에서는 손대지 않는다 — 네이티브 빔 커서가 계속 보여야 하고,
        // 이 컴포넌트도 'native'일 땐 아무것도 그리지 않는다(show 계산 참고).
        if (m !== 'native') {
          el.style.setProperty('cursor', 'none', 'important'); // ② 이제야 이 요소만 가린다
          hoveredRef.current = el;
        }
      } else {
        setMode('default');
      }
    };

    // ★ 버그 수정 지점 — 커서와 파동을 이 하나의 visible로 함께 켜고 끈다.
    //   따로 관리하면(이전 프리뷰가 그랬듯) 한쪽만 꺼지고 다른 쪽이 화면 끝에 남는다.
    //   더불어 호버 중이던 요소의 인라인 cursor:none도 함께 반드시 되돌린다 —
    //   안 그러면 마지막으로 가리키던 버튼이 커서가 사라진 채로 남는다.
    const hide = () => {
      setVisible(false);
      restoreHovered();
      // 다음에 같은 요소 위로 돌아와도 새로 분류하도록 — 그래야 떠나 있는 동안
      // (예: 다른 탭에 있었던 동안) 그 요소의 상태가 바뀌었어도 놓치지 않는다.
      lastElRef.current = null;
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) hide();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onOut);
    document.addEventListener('mouseleave', hide);
    window.addEventListener('blur', hide);

    return () => {
      restoreHovered();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseleave', hide);
      window.removeEventListener('blur', hide);
    };
  }, [coarse]);

  if (!mounted || coarse) return null;

  const show = visible && mode !== 'native';
  const hotspot = HOTSPOT[mode === 'native' ? 'default' : mode];

  return createPortal(
    <div
      ref={wrapRef}
      style={{
        position: 'fixed', top: 0, left: 0, zIndex: 999999, pointerEvents: 'none',
        marginLeft: -hotspot.x, marginTop: -hotspot.y,
        opacity: show ? 1 : 0, transition: 'opacity .1s ease',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {show && (
          <motion.div
            key={mode}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {mode === 'pointer' && <PointerGlyph reducedMotion={reducedMotion} />}
            {mode === 'disabled' && <DisabledGlyph />}
            {mode === 'default' && <ArrowGlyph />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
