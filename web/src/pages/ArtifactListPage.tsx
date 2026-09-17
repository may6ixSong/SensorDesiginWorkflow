import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectDetailDto } from '@/types/domain';
import { ProjectPageShell } from '@/components/project/ProjectPageShell';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Field, SelectInput, TextInput, TextArea } from '@/components/common/Panel';
import { Icon, IconName } from '@/components/common/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { NetworkChip } from '@/components/artifact/ArtifactChips';
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

  /**
   * 이 project에서 내가 속한 부서 — Artifact ACL의 "부서 단위 부여" 판정에 쓰인다
   * (사용자 요청 — Workflow 권한과 무관한 Calypso 자체 ACL, §3). Calypso는 SIREN의
   * project membership을 모르므로 매 요청 헤더로 실어 보낸다(calypsoClient.ts).
   */
  const myDepartments = useMemo(
    () => project.members.find((m) => m.knoxId === user?.KnoxID)?.departments ?? [],
    [project.members, user?.KnoxID],
  );

  const { data = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(project._id),
    queryFn: () => listCalypsoArtifacts({ projectId: project._id }),
  });

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
        <Box
          sx={{
            border: `1px solid ${T.dangerLine}`, background: T.dangerSoft, color: T.danger,
            borderRadius: '12px', padding: '18px 20px', fontSize: 12.5, lineHeight: 1.65,
          }}
        >
          <Box sx={{ fontWeight: 700, mb: '4px' }}>Could not reach the file service</Box>
          This list lives in Calypso, fetched through SIREN&apos;s backend. Check that Calypso is
          running and reachable from the SIREN API, then reload.
        </Box>
      ) : isLoading ? (
        /* 로딩 중에 아무것도 안 그리면 "빈 목록"과 구분이 안 된다 — 특히 Calypso가 응답하지
           않아 재시도가 도는 동안 화면이 통째로 비어 보였다(실측). 자리만이라도 잡아 둔다. */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                height: 62, borderRadius: '12px', border: `1px solid ${T.ln}`, background: T.sf,
                animation: 'sirenPulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </Box>
      ) : data.length === 0 ? (
        <Box
          sx={{
            border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
            padding: '40px 20px', textAlign: 'center',
          }}
        >
          <Box sx={{ fontSize: 13.5, fontWeight: 600, mb: '5px' }}>No artifacts you can access yet</Box>
          <Box sx={{ fontSize: 12, color: T.dm }}>
            {isAdmin ? 'Register the first one above.' : 'Register one, or ask an editor to grant you access.'}
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {data.map((a) => (
            <ArtifactRow key={a.id} artifact={a} onOpen={() => navigate(`/projects/${project._id}/artifacts/${a.id}`)} />
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

/**
 * 목록 아이콘 — 이 artifact가 지금 뭘 들고 있는지로 고른다(사용자 요청):
 *   HPC              → path(경로)
 *   File이 하나라도 있음 → word(지금까지 쓰던 아이콘)
 *   OA(파일 없음)      → link — Calypso 자신의 OA 콘텐츠 표시(ArtifactVersionContents의
 *                        "Open link" 버튼)와 같은 아이콘을 쓴다.
 *   그 외(network 미정 + 파일도 없음) → pending(대기 중)
 */
function iconForCalypsoArtifact(a: CalypsoArtifact): IconName {
  if (a.network === 'HPC') return 'path';
  if ((a.latestVersion?.files?.length ?? 0) > 0) return 'word';
  if (a.network === 'OA') return 'link';
  return 'pending';
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
        '&:hover': { borderColor: T.ln2, boxShadow: T.shXs },
      }}
    >
      <Box component="span" sx={{ color: T.pr, flex: '0 0 auto' }}>
        <Icon name={iconForCalypsoArtifact(a)} size={17} />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Box sx={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.name}
          </Box>
          <NetworkChip network={a.network} />
        </Box>
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

      <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, color: v?.isReleased ? T.pr : T.dm2, flex: '0 0 90px', textAlign: 'right' }}>
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
  const [network, setNetwork] = useState<'OA' | 'HPC'>('OA');
  const [nameErr, setNameErr] = useState(false);

  const dept = needsPicker ? (department || fallbackDept) : autoDept;

  const mutation = useMutation({
    mutationFn: () => createCalypsoArtifact({
      projectId: project._id, department: dept, name: name.trim(), description: description.trim(), network,
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
      <Field label="Network — can be changed later from the artifact detail">
        <Box sx={{ display: 'flex', gap: '4px' }}>
          {(['OA', 'HPC'] as const).map((n) => (
            <Box
              key={n}
              component="button"
              type="button"
              onClick={() => setNetwork(n)}
              sx={{
                fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: '999px',
                cursor: CURSOR_POINTER,
                background: n === network ? T.pr : T.sf,
                color: n === network ? '#fff' : T.dm,
                border: `1px solid ${n === network ? T.pr : T.ln2}`,
              }}
            >
              {n}
            </Box>
          ))}
        </Box>
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
            <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>{autoDept}</Badge>
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
