import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { Icon } from '@/components/common/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { getSirenProject } from '@/api/sirenClient';
import { ArtifactView, createArtifact, listArtifacts } from '@/api/client';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * Project 상세 = 그 project 아래 등록된 산출물 목록 (사용자 요청 — Artifacts가 아니라
 * Projects가 우선이고, project를 클릭해 들어오면 거기 산출물들이 list로 보인다).
 */
export function ProjectArtifactsPage() {
  const { projectId = '' } = useParams();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  /** My Artifacts 필터(구 My Task, Hub 설계서 §14.3) — 기본은 꺼짐(전체 보기). */
  const [mine, setMine] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['siren', 'project', projectId],
    queryFn: () => getSirenProject(projectId),
    enabled: Boolean(projectId),
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ['artifacts', projectId, mine],
    queryFn: () => listArtifacts({ projectId, mine }),
    enabled: Boolean(projectId),
  });

  const myDepartments = useMemo(
    () => project?.members.find((m) => m.knoxId === user?.KnoxID)?.departments ?? [],
    [project, user?.KnoxID],
  );

  return (
    <AppShell>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ p: '32px 36px', maxWidth: 1100, mx: 'auto' }}>
          <Box
            component={Link}
            to="/"
            sx={{ fontSize: 11.5, color: T.dm, textDecoration: 'none', '&:hover': { color: T.tx } }}
          >
            ← Projects
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: '8px', mb: 3 }}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
                  {project?.name ?? projectId}
                </Typography>
                {project && <Chip size="small" label={project.code} variant="outlined" />}
              </Stack>
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <ToggleButtonGroup
                size="small"
                exclusive
                value={mine ? 'mine' : 'all'}
                onChange={(_, v) => v && setMine(v === 'mine')}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="mine">My Artifacts</ToggleButton>
              </ToggleButtonGroup>
              <Button variant="contained" size="small" onClick={() => setOpen(true)}>
                Register
              </Button>
            </Stack>
          </Stack>

          {isLoading ? null : data.length === 0 ? (
            <Typography sx={{ color: T.dm, fontSize: 14 }}>
              {mine ? 'No artifacts registered by you in this project.' : 'No artifacts registered in this project yet.'}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {data.map((a) => (
                <ArtifactRow key={a.id} artifact={a} />
              ))}
            </Stack>
          )}

          <RegisterDialog
            open={open}
            onClose={() => setOpen(false)}
            projectId={projectId}
            candidateDepartments={project?.departments ?? []}
            myDepartments={myDepartments}
            isAdmin={isAdmin}
          />
        </Box>
      </Box>
    </AppShell>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactView }) {
  const navigate = useNavigate();
  const v = artifact.latestVersion;
  return (
    <Box
      onClick={() => navigate(`/artifacts/${artifact.id}`)}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 2,
        alignItems: 'center',
        p: '14px 16px',
        border: `1px solid ${T.ln}`,
        borderRadius: '10px',
        background: T.sf,
        cursor: 'pointer',
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

function RegisterDialog({
  open, onClose, projectId, candidateDepartments, myDepartments, isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** SIREN Project.departments — 이 과제가 인정하는 부서 후보 목록. */
  candidateDepartments: string[];
  /** 지금 사용자가 이 project의 members[]에서 속한 부서들. */
  myDepartments: string[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  /**
   * 소속이 정확히 하나면 자동 배정하고 department picker 자체를 숨긴다 - 2개 이상
   * 이거나 Admin이면 후보 목록에서 고르게 한다(사용자 요청). 소속이 0개인 경우도
   * 안전하게 picker를 보여준다 - 자동 배정할 값이 없기 때문이다.
   */
  const needsPicker = isAdmin || myDepartments.length !== 1;
  const fallbackDept = candidateDepartments[0] ?? myDepartments[0] ?? '';
  const autoDept = !needsPicker ? myDepartments[0] : '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');

  const dept = needsPicker ? (department || fallbackDept) : autoDept;

  const mutation = useMutation({
    mutationFn: () => createArtifact({ projectId, department: dept, name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifacts', projectId] });
      onClose();
      setName(''); setDescription(''); setDepartment('');
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: 17 }}>Register artifact</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {needsPicker ? (
            <TextField
              label="Department"
              size="small"
              select
              value={department || fallbackDept}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {(candidateDepartments.length ? candidateDepartments : myDepartments).map((d) => (
                <MenuItem key={d} value={d}>{d}</MenuItem>
              ))}
            </TextField>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12.5, color: T.dm }}>Department</Typography>
              <Chip size="small" icon={<Icon name="check" size={12} />} label={autoDept} />
            </Box>
          )}
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name || !dept || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
}
