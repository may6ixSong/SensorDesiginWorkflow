/**
 * The actual light/dark CSS custom property values are defined once, in
 * `index.html` (`:root` for light, `html[data-theme="dark"]` for dark) — they
 * need to exist there anyway so a render-blocking inline script can apply the
 * saved mode before first paint with no flash. This file only carries the type.
 */
export type ThemeMode = 'light' | 'dark';
