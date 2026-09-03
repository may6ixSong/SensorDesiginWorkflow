import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { T, FONT_MONO } from '@/theme/tokens';
import { ArtifactView, createArtifact, listArtifacts } from '@/api/client';

/** SIREN 공용 데이터(§4.4)에서 받아올 값 - 지금은 그 API가 붙기 전까지의 기본 목록이다. */
const DEPARTMENTS = ['Analog', 'Digital', 'APS', 'PI/PD', 'Solution', 'PTE'];

export function ArtifactsPage() {
  /**
   * My Task 필터 (Hub 설계서 §14.3). 기본은 꺼짐(전체 보기) - 처음 들어와서 자기
   * 항목이 하나도 없어 빈 화면을 보는 것보다, 토글이 눈에 띄는 편이 낫다.
   */
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ['artifacts', mine],
    queryFn: () => listArtifacts(mine),
  });

  return (
    <Box sx={{ p: '32px 36px', maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
          Artifacts
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mine ? 'mine' : 'all'}
            onChange={(_, v) => v && setMine(v === 'mine')}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="mine">My Task</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" size="small" onClick={() => setOpen(true)}>
            Register
          </Button>
        </Stack>
      </Stack>

      {isLoading ? null : data.length === 0 ? (
        <Typography sx={{ color: T.dm, fontSize: 14 }}>
          {mine ? 'No artifacts registered by you.' : 'No artifacts yet.'}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {data.map((a) => (
            <ArtifactRow key={a.id} artifact={a} />
          ))}
        </Stack>
      )}

      <RegisterDialog open={open} onClose={() => setOpen(false)} />
    </Box>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactView }) {
  const v = artifact.latestVersion;
  return (
    <Box
      component={Link}
      to={`/artifacts/${artifact.id}`}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 2,
        alignItems: 'center',
        p: '14px 16px',
        border: `1px solid ${T.ln}`,
        borderRadius: '10px',
        background: T.sf,
        textDecoration: 'none',
        color: T.tx,
        '&:hover': { borderColor: T.tl },
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{artifact.name}</Typography>
        <Typography sx={{ fontSize: 12, color: T.dm, mt: '2px' }}>{artifact.description}</Typography>
      </Box>
      <Chip size="small" label={artifact.department} variant="outlined" />
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: T.dm }}>
        {artifact.createdBy}
      </Typography>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: 12, color: v?.isReleased ? T.tl : T.dm }}>
        {v ? `${v.versionLabel}${v.isReleased ? '' : ' (working)'}` : '—'}
      </Typography>
    </Box>
  );
}

function RegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ projectId: '', department: DEPARTMENTS[0], name: '', description: '' });
  const mutation = useMutation({
    mutationFn: () => createArtifact(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifacts'] });
      onClose();
      setForm({ projectId: '', department: DEPARTMENTS[0], name: '', description: '' });
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: 17 }}>Register artifact</DialogTitle>
      <DialogContent>
        {/*
          project + department만 받는다 - workflow는 받지 않는다. Calypso는 workflow
          개념을 모르고, 어느 workflow가 이걸 쓸지는 SIREN에서 고른다 (Hub 설계서 §11.4).
        */}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Project"
            size="small"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          />
          <TextField
            label="Department"
            size="small"
            select
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          >
            {DEPARTMENTS.map((d) => (
              <MenuItem key={d} value={d}>{d}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Name"
            size="small"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <TextField
            label="Description"
            size="small"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.projectId || !form.name || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
}
