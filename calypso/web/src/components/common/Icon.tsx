/**
 * SIREN web(components/common/Icon.tsx)의 손그림풍 IC 아이콘 세트를 그대로 옮긴 것.
 * 모두 stroke=currentColor 기반이라 부모 color를 따라간다. Calypso 화면에서 실제로
 * 쓰는 이름만 남겼다 — DocIcon(word/excel/path 포맷 아이콘)은 산출물 서비스 링크
 * 개념으로 대체되어 더 이상 쓰지 않는다.
 */
export type IconName =
  | 'link' | 'word' | 'lock' | 'eye' | 'check' | 'plus' | 'x'
  | 'up' | 'dn' | 'send' | 'trash' | 'copy'
  | 'expand' | 'search' | 'list' | 'grid'
  | 'sun' | 'moon' | 'globe' | 'book' | 'info' | 'warn' | 'bell';

const P: Record<IconName, { d: string; s: number }> = {
  link: { s: 13, d: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' },
  word: { s: 14, d: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>' },
  lock: { s: 14, d: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
  eye: { s: 14, d: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
  check: { s: 14, d: '<path d="M20 6 9 17l-5-5"/>' },
  plus: { s: 13, d: '<path d="M12 5v14M5 12h14"/>' },
  x: { s: 15, d: '<path d="M18 6 6 18M6 6l12 12"/>' },
  up: { s: 13, d: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
  dn: { s: 13, d: '<path d="M12 5v14M19 12l-7 7-7-7"/>' },
  send: { s: 13, d: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>' },
  trash: { s: 13, d: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>' },
  copy: { s: 13, d: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>' },
  expand: { s: 12, d: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>' },
  search: { s: 13, d: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>' },
  list: { s: 14, d: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>' },
  grid: { s: 14, d: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>' },
  sun: { s: 14, d: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9"/>' },
  moon: { s: 14, d: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>' },
  globe: { s: 14, d: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/>' },
  book: { s: 14, d: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 19.5z"/>' },
  warn: { s: 14, d: '<path d="M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3l-8.5-14.5a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>' },
  info: { s: 14, d: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>' },
  bell: { s: 14, d: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
};

export function Icon({ name, size }: { name: IconName; size?: number }) {
  const spec = P[name] ?? P.word;
  const s = size ?? spec.s;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: '0 0 auto', display: 'block' }}
      dangerouslySetInnerHTML={{ __html: spec.d }}
    />
  );
}

/**
 * 상단바 Calypso 마크 — Calypso(오디세이아의 님프, 오기기아 섬의 동굴에 산다)를
 * 소용돌이 파도/조개 모양으로 표현한 것. favicon.svg와 같은 도안이다.
 */
export function CalypsoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Calypso" style={{ flex: '0 0 auto', display: 'block' }}>
      <path d="M16 6a10 10 0 1 1 -7.07 2.93" stroke="var(--siren-tl)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 10a6 6 0 1 1 -4.24 1.76" stroke="var(--siren-tl)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 14a2.6 2.6 0 1 1 -1.84 0.76" stroke="var(--siren-tl)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16.2" r="1.3" fill="var(--siren-tl)" />
    </svg>
  );
}
