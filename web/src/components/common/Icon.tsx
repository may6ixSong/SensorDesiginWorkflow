/**
 * 목업(analog-dashboard-v15.html)의 IC 아이콘 세트를 그대로 옮긴 것.
 * 모두 stroke=currentColor 기반이라 부모 color를 따라간다.
 */
export type IconName =
  | 'word' | 'excel' | 'path' | 'lock' | 'eye' | 'edit' | 'check' | 'plus' | 'x'
  | 'up' | 'dn' | 'send' | 'shield' | 'users' | 'trash' | 'note' | 'copy'
  | 'pan' | 'grid' | 'undo' | 'expand' | 'fit' | 'hist' | 'link';

const P: Record<IconName, { d: string; s: number }> = {
  word: { s: 14, d: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>' },
  excel: { s: 14, d: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' },
  path: { s: 14, d: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/>' },
  lock: { s: 14, d: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>' },
  eye: { s: 14, d: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
  edit: { s: 14, d: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>' },
  check: { s: 14, d: '<path d="M20 6 9 17l-5-5"/>' },
  plus: { s: 13, d: '<path d="M12 5v14M5 12h14"/>' },
  x: { s: 15, d: '<path d="M18 6 6 18M6 6l12 12"/>' },
  up: { s: 13, d: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
  dn: { s: 13, d: '<path d="M12 5v14M19 12l-7 7-7-7"/>' },
  send: { s: 13, d: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>' },
  shield: { s: 13, d: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' },
  users: { s: 11, d: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' },
  trash: { s: 13, d: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>' },
  note: { s: 13, d: '<path d="M4 4h16v11l-5 5H4z"/><path d="M20 15h-5v5"/>' },
  copy: { s: 13, d: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>' },
  pan: { s: 13, d: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>' },
  grid: { s: 14, d: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>' },
  undo: { s: 14, d: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 7"/>' },
  expand: { s: 12, d: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>' },
  fit: { s: 14, d: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>' },
  hist: { s: 13, d: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>' },
  link: { s: 13, d: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>' },
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

/** 산출물 형식(word/excel/path) 아이콘 — 알 수 없는 값은 word로 폴백. */
export function DocIcon({ type, size }: { type: string; size?: number }) {
  const name: IconName = type === 'excel' ? 'excel' : type === 'path' ? 'path' : 'word';
  return <Icon name={name} size={size} />;
}

/** 상단바 ARBOR 로고 (목업 .mark SVG 그대로) */
export function ArborMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Arbor" style={{ flex: '0 0 auto', display: 'block' }}>
      <path d="M16 29V13" stroke="#0c9a83" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 20.5 L9.5 15M16 17 L22.5 11.5M16 24 L21.5 19.5" stroke="#0c9a83" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16" cy="9.5" r="4.6" fill="#e0f5f0" stroke="#0c9a83" strokeWidth="1.5" />
      <circle cx="8.6" cy="14.2" r="3.1" fill="#e0f5f0" stroke="#0c9a83" strokeWidth="1.4" />
      <circle cx="23.4" cy="10.6" r="2.8" fill="#e0f5f0" stroke="#0c9a83" strokeWidth="1.4" />
      <circle cx="22.4" cy="18.8" r="2.4" fill="#e0f5f0" stroke="#0c9a83" strokeWidth="1.3" />
      <circle cx="16" cy="9.5" r="1.5" fill="#0c9a83" />
      <path d="M12 29h8" stroke="#0c9a83" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
