import { useMemo, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { DeliverableDto, IpDto, UserDto } from '@/types/domain';
import { useAddProjectMember, useProject, useProjectIps, useRemoveProjectMember } from '@/api/hooks/useProjects';
import { useDeliverables } from '@/api/hooks/useDeliverables';
import { useUsers } from '@/api/hooks/useUsers';
import { AppShell } from '@/components/layout/AppShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Card, Ey, Field, Row, SelectInput } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { Icon } from '@/components/common/Icon';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { progressOf } from '@/lib/projectProgress';
import { toast } from '@/store/toastStore';
import { FONT_DISPLAY, FONT_MONO, T } from '@/theme/tokens';

export function ProjectInfoPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading, isError } = useProject(projectId);
  const { data: ips, isLoading: ipsLoading } = useProjectIps(projectId);
  const { data: users } = useUsers();

  const own = useMemo(() => (ips ?? []).some((ip) => ip.myAccess === 'edit'), [ips]);
  const { pct, current, done, total } = useMemo(
    () => progressOf(project?.phases ?? []),
    [project?.phases],
  );

  if (projectLoading || ipsLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (isError || !project) {
    return (
      <AppShell users={users ?? []}>
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', padding: '40px' }}>
          <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, mb: '10px' }}>No viewable program</Typography>
            <Typography sx={{ fontSize: 13, color: T.dm, lineHeight: 1.8 }}>
              You don't have access to any IP under this program.
            </Typography>
          </Box>
        </Box>
      </AppShell>
    );
  }

  return (
    <AppShell users={users ?? []}>
      <Box sx={{ flex: 1, overflow: 'auto', background: T.bg }}>
        <Box sx={{ maxWidth: 1180, mx: 'auto', px: '28px', py: '30px' }}>
          {/* ── 헤더 ── */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '14px', mb: '10px', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 260 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '6px' }}>
                <Box
                  component="span"
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: '.1em', padding: '2px 8px',
                    borderRadius: '6px', background: T.sf3, color: T.dm, border: `1px solid ${T.ln}`,
                  }}
                >
                  {project.code}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.1em', padding: '2px 8px',
                    borderRadius: '999px', background: T.tl2, color: T.tl, border: `1px solid ${T.tl3}`,
                  }}
                >
                  {project.status}
                </Box>
                <Box component="span" sx={{ fontSize: 11.5, color: T.dm }}>{project.domain}</Box>
              </Box>
              <Box sx={{ fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: 800, letterSpacing: '-.02em' }}>
                {project.name}
              </Box>
            </Box>

            <Card sx={{ width: 260 }}>
              <Ey sx={{ mb: '7px' }}>Program progress</Ey>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mb: '6px' }}>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2 }}>{current}</Box>
                <Box sx={{ flex: 1 }} />
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: T.tl }}>{pct}%</Box>
              </Box>
              <Box sx={{ height: 6, borderRadius: 999, background: T.sf3, overflow: 'hidden' }}>
                <Box
                  sx={{
                    width: `${pct}%`, height: '100%', borderRadius: 999,
                    background: `linear-gradient(90deg, ${T.tl}, ${T.vi})`,
                  }}
                />
              </Box>
              <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '6px' }}>{done}/{total} phases complete</Box>
            </Card>
          </Box>

          {/* ── Milestones ── */}
          <SectionHeading icon="flag">Milestones</SectionHeading>
          <MilestoneTimeline phases={project.phases} />

          {/* ── IP Dashboard ── */}
          <SectionHeading icon="grid" sx={{ mt: '30px' }}>
            IP Dashboard
            <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px' }}>
              {(ips ?? []).length} IPs
            </Box>
          </SectionHeading>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px' }}>
            {(ips ?? []).map((ip) => (
              <IpDashboardCard key={ip.id} ip={ip} onOpen={() => navigate(`/details/${projectId}/${ip.id}`)} />
            ))}
            {!ips?.length && (
              <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No viewable IPs under this program.</Box>
            )}
          </Box>

          {/* ── 부서별 팀원 ── */}
          <SectionHeading icon="users" sx={{ mt: '30px' }}>
            Team Members
            <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px' }}>
              {project.members.length} people
            </Box>
          </SectionHeading>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px', mb: '20px' }}>
            {DEPARTMENTS.map((dept) => (
              <DepartmentMemberCard
                key={dept.id}
                projectId={project._id}
                deptId={dept.id}
                deptName={dept.name}
                members={project.members.filter((m) => m.department === dept.id)}
                allUsers={users ?? []}
                takenUserIds={new Set(project.members.map((m) => m.user.id))}
                canManage={own}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}

function SectionHeading({
  icon, children, sx,
}: { icon: 'flag' | 'grid' | 'users'; children: React.ReactNode; sx?: object }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mb: '12px', ...sx }}>
      <Box component="span" sx={{ color: T.tl, display: 'flex' }}>
        <Icon name={icon} size={15} />
      </Box>
      <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>{children}</Box>
    </Box>
  );
}

/* ── Milestones ── */
function MilestoneTimeline({ phases }: { phases: { key: string; label: string; start: string; end: string; order: number }[] }) {
  const sorted = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const now = Date.now();

  return (
    <Box
      sx={{
        display: 'flex', gap: '10px', overflowX: 'auto', pb: '6px', mb: '24px',
      }}
    >
      {sorted.map((p) => {
        const st = new Date(p.start).getTime();
        const en = new Date(p.end).getTime();
        const state = now < st ? 'upcoming' : now > en ? 'done' : 'current';
        const days = Math.max(1, Math.round((en - st) / 864e5));
        const tone = {
          upcoming: { c: T.dm2, bg: T.sf2, bd: T.ln },
          current: { c: T.tl, bg: T.tl2, bd: T.tl3 },
          done: { c: T.dm, bg: T.sf3, bd: T.ln },
        }[state];
        return (
          <Card key={p.key} sx={{ flex: '0 0 168px', borderColor: state === 'current' ? T.tl3 : T.ln }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '6px' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>{p.key}</Box>
              <Box
                component="span"
                sx={{
                  fontSize: 9, fontFamily: FONT_MONO, padding: '1px 6px', borderRadius: '999px',
                  color: tone.c, background: tone.bg, border: `1px solid ${tone.bd}`,
                }}
              >
                {state === 'current' ? 'NOW' : state === 'done' ? 'DONE' : 'UPCOMING'}
              </Box>
            </Box>
            <Box sx={{ fontSize: 12, fontWeight: 500, mb: '8px', lineHeight: 1.3 }}>{p.label}</Box>
            <Box sx={{ fontSize: 10, color: T.dm2, fontFamily: FONT_MONO }}>
              {p.start} → {p.end}
            </Box>
            <Box sx={{ fontSize: 10, color: T.dm2, mt: '2px' }}>{days}d</Box>
          </Card>
        );
      })}
    </Box>
  );
}

/* ── IP 대시보드 카드 ── */
function statusCounts(deliverables: DeliverableDto[]) {
  let notSubmitted = 0;
  let inProgress = 0;
  let released = 0;
  deliverables.forEach((d) => {
    if (!d.versions.length) notSubmitted++;
    else if (d.workingVersion) inProgress++;
    else released++;
  });
  return { notSubmitted, inProgress, released, total: deliverables.length };
}

function IpDashboardCard({ ip, onOpen }: { ip: IpDto; onOpen: () => void }) {
  const { data: deliverables } = useDeliverables(ip.id);
  const counts = useMemo(() => statusCounts(deliverables ?? []), [deliverables]);
  const pct = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);

  return (
    <Box
      onClick={onOpen}
      sx={{
        position: 'relative', cursor: 'pointer', background: T.sf,
        border: `1px solid ${T.ln}`, borderRadius: '12px', overflow: 'hidden',
        boxShadow: T.ss, transition: 'transform .16s, box-shadow .16s, border-color .16s',
        padding: '15px 16px',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: T.sl, borderColor: T.ln2 },
        '&::before': {
          content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: ip.color || T.tl,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px', mb: '6px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 14.5, fontWeight: 700 }}>{ip.name}</Box>
          <Box sx={{ fontSize: 11, color: T.dm, mt: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ip.description || 'No description'}
          </Box>
        </Box>
        <Icon name="expand" />
      </Box>

      <Box sx={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: T.sf3, my: '10px' }}>
        <Box sx={{ width: `${pct(counts.released)}%`, background: T.tl }} />
        <Box sx={{ width: `${pct(counts.inProgress)}%`, background: T.am }} />
      </Box>
      <Box sx={{ display: 'flex', gap: '10px', fontSize: 10.5, color: T.dm2, mb: '11px' }}>
        <Box component="span" sx={{ color: T.tl }}>{counts.released} released</Box>
        <Box component="span" sx={{ color: T.am }}>{counts.inProgress} in progress</Box>
        <Box component="span">{counts.notSubmitted} not submitted</Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {ip.owners.slice(0, 4).map((u, i) => (
          <Box key={u.id} sx={{ ml: i ? '-7px' : 0, borderRadius: '8px', border: `2px solid ${T.sf}`, display: 'flex' }}>
            <UserAvatar user={u} size={22} />
          </Box>
        ))}
        <Box sx={{ flex: 1 }} />
        <Box
          component="span"
          sx={{
            fontSize: 10, padding: '2px 7px', borderRadius: '999px', fontFamily: FONT_MONO,
            background: T.sf2, border: `1px solid ${T.ln}`, color: T.dm,
          }}
        >
          {counts.total} items
        </Box>
      </Box>
    </Box>
  );
}

/* ── 부서별 팀원 카드 ── */
function DepartmentMemberCard({
  projectId, deptId, deptName, members, allUsers, takenUserIds, canManage,
}: {
  projectId: string;
  deptId: string;
  deptName: string;
  members: { user: UserDto; department: string; addedAt: string }[];
  allUsers: UserDto[];
  takenUserIds: Set<string>;
  canManage: boolean;
}) {
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const candidates = allUsers.filter((u) => !takenUserIds.has(u.id));
  const [sel, setSel] = useState('');

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>{deptName}</Ey>
      {members.length ? (
        members.map((m) => (
          <Box
            key={m.user.id}
            sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 0', borderBottom: `1px solid ${T.ln}` }}
          >
            <UserAvatar user={m.user} size={26} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.user.name}
              </Box>
              <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{departmentName(m.user.department)}</Box>
            </Box>
            {canManage && (
              <AcroButton
                variant="ghost"
                onClick={() => removeMember.mutate(m.user.id, { onSuccess: () => toast('Member removed') })}
              >
                <Icon name="trash" />
              </AcroButton>
            )}
          </Box>
        ))
      ) : (
        <Box sx={{ fontSize: 12, color: T.dm2, pb: '6px' }}>No members yet.</Box>
      )}

      {canManage && (
        <Row sx={{ mt: '10px' }}>
          <Field label="Add member" sx={{ flex: 1, mb: 0 }}>
            <SelectInput
              value={sel || candidates[0]?.id || ''}
              onChange={setSel}
              disabled={!candidates.length}
              options={
                candidates.length
                  ? candidates.map((u) => ({ value: u.id, label: u.name }))
                  : [{ value: '', label: 'Everyone is already on the roster' }]
              }
            />
          </Field>
          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <AcroButton
              disabled={!candidates.length}
              onClick={() => {
                const u = sel || candidates[0]?.id;
                if (u) {
                  addMember.mutate(
                    { userId: u, department: deptId },
                    { onSuccess: () => { setSel(''); toast('Member added'); } },
                  );
                }
              }}
            >
              <Icon name="plus" /> Add
            </AcroButton>
          </Box>
        </Row>
      )}
    </Card>
  );
}
