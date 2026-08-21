import { Box } from '@mui/material';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface Section {
  key: string;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    key: 'BOARD',
    title: 'Deliverable board',
    body: [
      'Each IP has one board. Deliverables are laid out left to right across the project phases (Kick-off → Fab Out), and arrows between them show which deliverable feeds which.',
      'Scroll to zoom, drag empty space to pan. The board never zooms out past the point where it fills the viewport.',
    ],
  },
  {
    key: 'EDIT',
    title: 'Editing the layout',
    body: [
      'Only Analog owners of the IP can edit. Press the pencil in the bottom-left toolbox to enter edit mode; the check mark saves and exits, the arrow discards every change made in that session.',
      'Drag a block to move it. Pushing it across a phase boundary takes a little force, so a block will not change phase by accident. Drag the bottom-right corner to resize, and use the right-hand pin to draw a link to another deliverable.',
    ],
  },
  {
    key: 'VERSIONS',
    title: 'Versions and releases',
    body: [
      'Uploading a working copy bumps the minor version and stays visible only to the IP owners. Release promotes it to the next major version, and that is the version recipient departments see.',
      'The Recipient-dept view toggle in the top bar shows the board exactly as a receiving department sees it — working copies disappear.',
    ],
  },
  {
    key: 'HLD',
    title: 'HLD release',
    body: [
      'An HLD release is a snapshot of every deliverable version in the IP at one moment. Open it from the button on the IP header.',
      'Rows whose version changed since the previous HLD are highlighted, so a reviewer can see what actually moved between two snapshots.',
    ],
  },
  {
    key: 'ACCESS',
    title: 'Access',
    body: [
      'Edit access is limited to the Analog department; the primary owner cannot be removed. View access can be granted to anyone, and the position recorded with the grant is what the deliverable handoff list maps to.',
      'An IP you have neither Edit nor View access to does not appear in the IP selector at all.',
    ],
  },
];

export function GuidePage() {
  const { data: users } = useUsers();

  return (
    <AppShell users={users ?? []}>
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
            How deliverables move through a project in SIREN — the board, versioning, HLD
            snapshots, and who can change what.
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
