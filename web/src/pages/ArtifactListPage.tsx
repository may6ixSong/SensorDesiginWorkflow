import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectDetailDto } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Field, SelectInput, TextInput, TextArea } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { queryKeys } from '@/api/queryKeys';
import { CalypsoArtifact, createCalypsoArtifact, listCalypsoArtifacts } from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

export function ArtifactListPage() {
  return (
    <ProjectPageShell>
      {({ project }) => <ArtifactList project={project} />}
    </ProjectPageShell>
  );
}

function ArtifactList({ project }: { project: ProjectDetailDto }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(project._id),
    queryFn: () => listCalypsoArtifacts({ projectId: project._id }),
  });

  /**
   * 이 project에서 내가 속한 부서 — "내가 올려야 하거나 받아야 하는" 산출물의 대리
   * 신호로 쓴다(사용자 요청 §3). Calypso는 아직 수신자 개념이 없어서(project+department만
   * 안다), 부서 소속이 그 부서가 주고받는 산출물에 대한 이해관계를 나타내는 가장 가까운
   * 값이다 — 내가 만든 것(createdBy)도 항상 포함한다.
   */
  const myDepartments = useMemo(
    () => project.members.find((m) => m.knoxId === user?.KnoxID)?.departments ?? [],
    [project.members, user?.KnoxID],
  );

  const visible = useMemo(() => {
    if (isAdmin) return data;
    const myDeptSet = new Set(myDepartments);
    return data.filter((a) => myDeptSet.has(a.department) || a.createdBy === user?.KnoxID);
  }, [data, isAdmin, myDepartments, user?.KnoxID]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
          Artifacts
          <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
            {isAdmin
              ? 'every artifact registered under this project (Admin)'
              : 'artifacts your departments give or receive'}
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <SirenButton variant="primary" onClick={() => setRegisterOpen(true)}>
          <Icon name="plus" /> Register
        </SirenButton>
      </Box>

      {isError ? (
        <Box sx={{ fontSize: 12.5, color: T.dm }}>Could not reach Calypso. Check CALYPSO_API and its CORS_ORIGIN.</Box>
      ) : isLoading ? null : visible.length === 0 ? (
        <Box
          sx={{
            border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
            padding: '40px 20px', textAlign: 'center',
          }}
        >
          <Box sx={{ fontSize: 13.5, fontWeight: 600, mb: '5px' }}>
            {data.length === 0 ? 'No artifacts registered in this project yet' : 'No artifacts for your departments yet'}
          </Box>
          <Box sx={{ fontSize: 12, color: T.dm }}>
            {data.length === 0 ? 'Register the first one above.' : `${data.length} registered under other departments.`}
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {visible.map((a) => (
            <ArtifactRow key={a.id} artifact={a} onOpen={() => navigate(`/artifacts/${a.id}`)} />
          ))}
        </Box>
      )}

      {registerOpen && (
        <RegisterDialog
          project={project}
          myDepartments={myDepartments}
          isAdmin={isAdmin}
          onClose={() => setRegisterOpen(false)}
        />
      )}
    </>
  );
}

function ArtifactRow({ artifact: a, onOpen }: { artifact: CalypsoArtifact; onOpen: () => void }) {
  const { resolveUser } = useDirectory();
  const by = resolveUser(a.createdBy);
  const v = a.latestVersion;

  return (
    <Box
      onClick={onOpen}
      sx={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '12px 16px', border: `1px solid ${T.ln}`, borderRadius: '10px',
        background: T.sf, cursor: CURSOR_POINTER,
        transition: 'border-color .14s, box-shadow .14s',
        '&:hover': { borderColor: T.ln2, boxShadow: T.ss },
      }}
    >
      <Box component="span" sx={{ color: T.tl, flex: '0 0 auto' }}>
        <Icon name="word" size={17} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</Box>
        {a.description && (
          <Box sx={{ fontSize: 11.5, color: T.dm, mt: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.description}
          </Box>
        )}
      </Box>

      <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{a.department}</Badge>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 130px' }}>
        <UserAvatar user={by} size={20} />
        <Box sx={{ fontSize: 11.5, color: T.dm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {by.name}
        </Box>
      </Box>

      <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, color: v?.isReleased ? T.tl : T.dm2, flex: '0 0 90px', textAlign: 'right' }}>
        {v ? `v${v.versionLabel}${v.isReleased ? '' : ' (w)'}` : 'No versions'}
      </Box>

      <Icon name="expand" size={13} />
    </Box>
  );
}

function RegisterDialog({
  project, myDepartments, isAdmin, onClose,
}: {
  project: ProjectDetailDto; myDepartments: string[]; isAdmin: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  /**
   * 소속이 정확히 하나면 자동 배정하고 department picker 자체를 숨긴다 — 2개 이상이거나
   * Admin이면 후보 목록에서 고르게 한다(사용자 요청). 소속이 0개인 경우도 안전하게
   * picker를 보여준다 — 자동 배정할 값이 없기 때문이다.
   */
  const needsPicker = isAdmin || myDepartments.length !== 1;
  const fallbackDept = project.departments[0] ?? myDepartments[0] ?? '';
  const autoDept = !needsPicker ? myDepartments[0] : '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [nameErr, setNameErr] = useState(false);

  const dept = needsPicker ? (department || fallbackDept) : autoDept;

  const mutation = useMutation({
    mutationFn: () => createCalypsoArtifact({
      projectId: project._id, department: dept, name: name.trim(), description: description.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(project._id) });
      toast('Artifact registered');
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to register'),
  });

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    mutation.mutate();
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={<Box sx={{ fontSize: 16, fontWeight: 700 }}>Register artifact</Box>}
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setNameErr(false); }}
          error={nameErr}
          placeholder="e.g. PLL Loop Filter Design Spec"
        />
      </Field>
      <Field label="Description">
        <TextArea value={description} onChange={setDescription} rows={3} />
      </Field>
      {needsPicker ? (
        <Field label="Department">
          <SelectInput
            value={department || fallbackDept}
            onChange={setDepartment}
            options={(project.departments.length ? project.departments : myDepartments)
              .map((d) => ({ value: d, label: d }))}
          />
        </Field>
      ) : (
        <Field label="Department">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
            <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>{autoDept}</Badge>
            <Box sx={{ fontSize: 11, color: T.dm2 }}>assigned from your project membership</Box>
          </Box>
        </Field>
      )}
      <SirenButton
        variant="primary"
        disabled={!name.trim() || !dept || mutation.isPending}
        onClick={submit}
        sx={{ mt: '4px' }}
      >
        <Icon name="check" /> Register
      </SirenButton>
    </ModalShell>
  );
}
