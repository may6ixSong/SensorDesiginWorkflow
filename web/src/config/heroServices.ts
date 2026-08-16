/**
 * Content for the floating cards on the Home hero (`pages/HomePage.tsx`).
 * Edit this list to change which deliverables/services show up there — nothing
 * else in the app reads this file, so it's safe to add, remove, or rename freely.
 *
 * `connected: true` renders a live "● LIVE :port" badge and an animated,
 * brightly-lit line flowing from the card into the ACRO wordmark — meant to read
 * as "already running as its own service, being folded into ACRO." `connected:
 * false` renders a dim, static line with a "○ pending" badge instead — "not
 * integrated yet."
 *
 * x/y/z/r position the card in the hero's 3D stage (px offsets from center,
 * r = degrees of Y-axis tilt); d staggers the floating animation so cards
 * don't all bob in sync. Fine to reuse a rough spot from a neighboring entry —
 * exact placement doesn't need to be precise.
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
  d: number;
}

export const HERO_SERVICES: HeroService[] = [
  { name: 'ATOP Portlist', tag: 'PORT · v2.1', color: '#2ee6c5', connected: true, port: ':7301', x: -560, y: -260, z: 210, r: 16, d: 0 },
  { name: 'PDK/DK', tag: 'PDK · v4.0', color: '#7c8cff', connected: true, port: ':7412', x: -620, y: 70, z: 90, r: 20, d: 0.7 },
  { name: 'APS Verilog', tag: 'RTL · v1.4', color: '#ffb45e', connected: false, x: 560, y: -260, z: 130, r: -18, d: 1.3 },
  { name: 'DBS Simulation', tag: 'SIM · v3.0', color: '#2ee6c5', connected: false, x: 500, y: 80, z: 150, r: -22, d: 1.9 },
  { name: 'ADC Timing', tag: 'TMG · v1.0', color: '#ff6f91', connected: false, x: -340, y: 330, z: 180, r: 10, d: 2.4 },
  { name: 'RPM System', tag: 'SYS · v2.3', color: '#7c8cff', connected: true, port: ':7550', x: 340, y: 330, z: 150, r: -10, d: 1.1 },
  { name: 'LEF/Phantom', tag: 'LEF · v1.1', color: '#ffb45e', connected: false, x: 0, y: -280, z: 200, r: 0, d: 1.7 },
];
