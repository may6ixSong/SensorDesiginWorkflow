/**
 * Content for the floating cards on the Home hero (`pages/HomePage.tsx`).
 * Edit this list to change which deliverables/services show up there — nothing
 * else in the app reads this file, so it's safe to add, remove, or rename freely.
 *
 * `connected: true` renders a live "● LIVE :port" badge and an animated,
 * brightly-lit line flowing from the card into the SIREN wordmark — meant to read
 * as "already running as its own service, being folded into SIREN." `connected:
 * false` renders a dim, static line with a "○ pending" badge instead — "not
 * integrated yet."
 *
 * x/y/z position the card in the hero's 3D stage (px offsets from center); r is
 * a Y-axis tilt in degrees, kept at 0 so the cards stay squarely aligned. `color`
 * only tints the thin accent bar — the card's border and shadow are uniform on
 * purpose, so keep these within the muted teal/steel/slate range rather than
 * introducing bright hues.
 */
export interface HeroService {
  name: string;
  tag: string;
  color: string;
  connected: boolean;
  port?: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

export const HERO_SERVICES: HeroService[] = [
  { name: 'ATOP Portlist', tag: 'PORT · v2.1', color: '#3fa38f', connected: true, port: ':7301', x: -560, y: -250, z: 200, r: 0 },
  { name: 'PDK/DK', tag: 'PDK · v4.0', color: '#4a7ba7', connected: true, port: ':7412', x: -600, y: 60, z: 110, r: 0 },
  { name: 'APS Verilog', tag: 'RTL · v1.4', color: '#6b7a9e', connected: false, x: 560, y: -250, z: 140, r: 0 },
  { name: 'DBS Simulation', tag: 'SIM · v3.0', color: '#6b7a9e', connected: false, x: 520, y: 70, z: 160, r: 0 },
  { name: 'ADC Timing', tag: 'TMG · v1.0', color: '#8a7fa8', connected: false, x: -340, y: 320, z: 180, r: 0 },
  { name: 'RPM System', tag: 'SYS · v2.3', color: '#3fa38f', connected: true, port: ':7550', x: 340, y: 320, z: 160, r: 0 },
  { name: 'LEF/Phantom', tag: 'LEF · v1.1', color: '#6b7a9e', connected: false, x: 0, y: -290, z: 200, r: 0 },
];
