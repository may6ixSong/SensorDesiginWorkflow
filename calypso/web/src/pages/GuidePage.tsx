import { Box } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

interface Section {
  key: string;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    key: 'PROJECTS',
    title: 'Projects',
    body: [
      'Calypso does not own projects — SIREN does. The list on the home page is read live from SIREN, so it always matches the projects registered there.',
      'Opening a project shows every artifact registered under it in Calypso, across all departments.',
    ],
  },
  {
    key: 'REGISTER',
    title: 'Registering an artifact',
    body: [
      'An artifact belongs to a project and a department, never to a workflow — which workflow uses it is decided on the SIREN side, not here.',
      'If you belong to exactly one department on that project, it is assigned automatically. Belonging to more than one, or having Admin group, shows a picker instead.',
    ],
  },
  {
    key: 'VERSIONS',
    title: 'Versions and releases',
    body: [
      'Uploading a working copy bumps the minor version and is visible only to the person who registered the artifact. Release promotes it to the next major version, and that is the version SIREN and everyone else sees.',
    ],
  },
  {
    key: 'FILTER',
    title: 'My Artifacts',
    body: [
      'The My Artifacts toggle on a project page narrows the list to artifacts you registered yourself.',
    ],
  },
];

export function GuidePage() {
  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 780, mx: 'auto', px: '28px', py: '40px' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.22em', color: T.dm2 }}>
            CALYPSO
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
            How artifacts are registered and versioned in Calypso, and how projects relate to SIREN.
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
