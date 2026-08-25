/**
 * Total workflow view 전용 팔레트.
 *
 * 앱 전역 토큰(T)은 라이트/다크 테마에 따라 뒤집히지만, 이 화면은 "우주"라는 은유
 * 자체가 어두운 배경을 전제로 한다(별이 보이려면 하늘이 검어야 한다). 그래서 테마와
 * 무관하게 항상 어두운 값을 쓰고, 여기 상수만 바꾸면 화면 전체 톤이 따라온다.
 */
export const SPACE = {
  void0: '#03060d',
  void1: '#070c1a',
  void2: '#0d1428',

  panel: 'rgba(9,15,30,.82)',
  panelSolid: '#0a1020',
  hair: 'rgba(150,180,230,.16)',
  hair2: 'rgba(150,180,230,.30)',

  tx: '#e9effc',
  dm: 'rgba(202,216,242,.74)',
  dm2: 'rgba(180,200,232,.46)',

  teal: '#3ddbc0',
  amber: '#ffb020',
  violet: '#8b7bff',
  rose: '#ff6b9d',
  ice: '#9fd4ff',
} as const;

/** released / in progress / not submitted 3색 — 기존 마일스톤 보드와 의미가 같다. */
export const STATUS_COLOR = {
  released: SPACE.teal,
  inProgress: SPACE.amber,
  notSubmitted: 'rgba(170,190,220,.34)',
} as const;

/** SVG/DOM 양쪽에서 쓰는 키프레임 — 컴포넌트가 <style>로 한 번만 주입한다. */
export const UNIVERSE_KEYFRAMES = `
@keyframes wu-twinkle { 0%,100% { opacity:.25 } 50% { opacity:1 } }
@keyframes wu-breathe { 0%,100% { opacity:.55; transform:scale(1) } 50% { opacity:.9; transform:scale(1.06) } }
@keyframes wu-dash { to { stroke-dashoffset: -240 } }
@keyframes wu-rise { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
@keyframes wu-slide { from { opacity:0; transform:translateX(14px) } to { opacity:1; transform:none } }
@media (prefers-reduced-motion: reduce) {
  .wu-anim { animation: none !important; }
}
`;
