import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { T, FONT_MONO } from '@/theme/tokens';
import { getArtifact, releaseArtifact, uploadVersion } from '@/api/client';

export function ArtifactDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');

  const { data: artifact } = useQuery({ queryKey: ['artifact', id], queryFn: () => getArtifact(id) });

  const upload = useMutation({
    mutationFn: (file: File) => uploadVersion(id, file, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifact', id] });
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
    },
  });
  const release = useMutation({
    mutationFn: () => releaseArtifact(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifact', id] });
      setNote('');
    },
  });

  if (!artifact) return null;
  const latest = artifact.latestVersion;

  return (
    <Box sx={{ p: '32px 36px', maxWidth: 900, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{artifact.name}</Typography>
        <Chip size="small" label={artifact.department} variant="outlined" />
      </Stack>
      <Typography sx={{ color: T.dm, fontSize: 13, mt: '4px' }}>{artifact.description}</Typography>

      {artifact.canEdit && (
        <Box sx={{ mt: 3, p: '18px 20px', border: `1px solid ${T.ln}`, borderRadius: '10px', background: T.sf }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <input type="file" ref={fileRef} />
            <TextField
              size="small"
              placeholder="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              size="small"
              disabled={upload.isPending}
              onClick={() => {
                const file = fileRef.current?.files?.[0];
                if (file) upload.mutate(file);
              }}
            >
              Upload
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={!latest || latest.isReleased || release.isPending}
              onClick={() => release.mutate()}
            >
              Release
            </Button>
          </Stack>
        </Box>
      )}

      <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 4, mb: 1.5 }}>Versions</Typography>
      <Stack spacing={0.75}>
        {(artifact.versions ?? []).map((v) => (
          <Box
            key={v.versionRef}
            sx={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr auto auto',
              gap: 2,
              alignItems: 'center',
              p: '10px 14px',
              border: `1px solid ${T.ln}`,
              borderRadius: '8px',
              background: v.isReleased ? T.sf2 : 'transparent',
            }}
          >
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 13, color: v.isReleased ? T.tl : T.dm }}>
              {v.versionLabel}
              {v.isReleased ? '' : ' ·w'}
            </Typography>
            <Typography sx={{ fontSize: 13 }}>{v.fileName}</Typography>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>{v.createdBy}</Typography>
            <Typography sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>
              {v.createdAt.slice(0, 10)}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
