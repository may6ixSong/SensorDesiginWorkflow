import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface Section {
  key: string;
  title: string;
  body: string[];
}

/**
 * ★ 이 목록은 **지금의 제품**을 설명해야 한다. 예전 판에는 'HLD release', 'Deliverable
 *   board', minor/major 승격 같은 폐기된 개념이 그대로 남아 있어서, 도움말이 오히려
 *   틀린 모델을 가르치고 있었다(설계서 06장 §3 — HLD 명명 전면 제거).
 */
const SECTIONS: Section[] = [
  {
    key: 'CANVAS',
    title: 'The canvas',
    body: [
      'Each workflow has one canvas. Blocks sit left to right across that workflow\'s own phases, and arrows between them show which artifact feeds which.',
      'A block is a place, not the artifact itself. It holds a spot on the schedule; the real artifact is mapped to it and can be shared by several workflows at once.',
      'Scroll to zoom, drag empty space to pan. Click a block to trace its flow, then press the eye in its corner to open the details panel.',
    ],
  },
  {
    key: 'EDIT',
    title: 'Editing the canvas',
    body: [
      'Anyone with Edit access to the workflow can rearrange it. Press the pencil in the bottom-left toolbox to enter edit mode; the check mark saves and exits, the arrow discards every change made in that session.',
      'Only one person edits a canvas at a time. Entering edit mode takes a lock that lasts ten minutes and renews itself while you work, so a second editor is told who holds it instead of silently overwriting them.',
      'Drag a block to move it. Pushing it across a phase boundary takes a little force, so a block will not change phase by accident. Drag the bottom-right corner to resize, and use the right-hand pin to draw a link to another block.',
      'The canvas has no versions of its own — saving overwrites the layout, and nothing about the layout is kept as history.',
    ],
  },
  {
    key: 'PUBLISH',
    title: 'Publish',
    body: [
      'An artifact is published inside the service that owns it — Calypso, a simulation service, or by hand for the lower tiers. SIREN observes that and shows the state on the block: not published, published, or new since the last release.',
      'Tier A artifacts are governed entirely by the owning service. SIREN never grants access to them; it only shows what that service says you may see.',
    ],
  },
  {
    key: 'RELEASE',
    title: 'Release',
    body: [
      'A release is the workflow handing its artifacts to other departments. It is numbered per workflow — v1, v2, v3 — and every mapped artifact is included, whether or not it changed.',
      'Rows whose artifact moved to a new major version since the last release are highlighted, and only those ask you to pick which version goes out. Everything else carries over what the previous release sent.',
      'A release cannot be edited, deleted, or revoked once it is out. That is deliberate: the record of what a department was handed has to stay true.',
    ],
  },
  {
    key: 'ACCESS',
    title: 'Access',
    body: [
      'Access is decided in three layers. The project decides who can see anything at all, the workflow decides Edit or View on the canvas, and each artifact decides who can open it.',
      'Every grant is a set of departments plus a set of individuals, and department grants are evaluated live — someone who joins the department later gets access immediately.',
      'A workflow you have neither Edit nor View access to does not appear in the workflow selector at all.',
      'For Tier A artifacts, being on the recipient list is only the first gate: the owning service still decides whether the panel actually opens.',
    ],
  },
];

export function GuidePage() {
  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 780, mx: 'auto', px: '28px', py: '40px' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.22em', color: T.dm2 }}>
            SIREN
          </Box>
          <Box
            sx={{
              fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 800,
              letterSpacing: '-.02em', mt: '6px',
            }}
          >
            User Guide
          </Box>
          <Box sx={{ fontSize: 13, color: T.dm, mt: '8px', lineHeight: 1.7 }}>
            How artifacts move through a project in SIREN — the canvas, publish and release,
            and who can change what.
          </Box>

          <Box sx={{ mt: '34px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {SECTIONS.map((s) => (
              <Box
                key={s.key}
                sx={{
                  padding: '22px 0',
                  borderTop: `1px solid ${T.ln}`,
                  display: 'flex',
                  gap: '22px',
                  alignItems: 'flex-start',
                }}
              >
                <Box
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.14em',
                    color: T.dm2, flex: '0 0 88px', mt: '3px',
                  }}
                >
                  {s.key}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>
                    {s.title}
                  </Box>
                  {s.body.map((p) => (
                    <Box key={p} sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8, mt: '10px' }}>
                      {p}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}
