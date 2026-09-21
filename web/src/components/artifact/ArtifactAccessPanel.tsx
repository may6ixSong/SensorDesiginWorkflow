import { useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CalypsoArtifact, CalypsoDepartment, CalypsoGrant, CalypsoGrantInput, getCalypsoDepartmentRoster } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserAvatar } from '@/components/common/Avatar';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';

interface Props {
  artifact: CalypsoArtifact;
  /** SIREN project id — 부서/멤버 로스터를 여기서 직접 읽지 않고 Calypso를 거쳐
   * 되묻는다(사용자 결정, `getCalypsoDepartmentRoster` 참고). */
  projectId: string;
  onAddEditor: (g: CalypsoGrantInput) => void;
  onRemoveEditor: (g: CalypsoGrantInput) => void;
  onAddViewGrant: (g: CalypsoGrantInput) => void;
  onRemoveViewGrant: (g: CalypsoGrantInput) => void;
  onSetRestrictView: (restrictView: boolean) => void;
}

function grantKey(g: { type: string; knoxId: string | null; department: string | null }): string {
  return `${g.type}:${g.knoxId ?? g.department}`;
}

function grantInput(g: CalypsoGrant): CalypsoGrantInput {
  return g.type === 'user' ? { type: 'user', knoxId: g.knoxId as string } : { type: 'department', department: g.department as string };
}

/**
 * Artifact별 독립 ACL 관리 — 등록자/Admin 외에 추가로 Editor·Viewer 권한을 부여/회수한다.
 * `myAccess==='edit'`인 사람만 호출부에서 이 패널을 띄운다(서버도 같은 조건으로 재검증).
 *
 * 워크플로우 상세 패널(DeliverableDialog)과 독립 Artifact detail page 양쪽에서 그대로
 * 재사용한다 — 권한 데이터는 Calypso 하나뿐이고 진입점만 두 개다(사용자 요청).
 *
 * ★ Viewer 목록은 `restrictView`를 켰을 때만 보여준다(사용자 요청) — 꺼져 있으면 이
 *   project 누구나 볼 수 있으니 목록 자체가 의미가 없다.
 */
export function ArtifactAccessPanel({
  artifact, projectId, onAddEditor, onRemoveEditor, onAddViewGrant, onRemoveViewGrant, onSetRestrictView,
}: Props) {
  const { data: roster, isLoading: loadingRoster, isError: rosterError } = useQuery({
    queryKey: queryKeys.calypsoDepartmentRoster(projectId),
    queryFn: () => getCalypsoDepartmentRoster(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const membersByDept = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of roster?.members ?? []) {
      for (const d of m.departments) {
        (map[d] ??= []).push(m.knoxId);
      }
    }
    return map;
  }, [roster]);

  const allDepartments = roster?.departments ?? [];

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Permission</Ey>
      <GrantList
        label="Editor"
        grants={artifact.editors}
        registrant={artifact.createdBy}
        deptOptions={allDepartments}
        membersByDept={membersByDept}
        loadingDepts={loadingRoster}
        deptError={rosterError}
        onAdd={onAddEditor}
        onRemove={onRemoveEditor}
      />
      <Box sx={{ height: '14px' }} />

      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 10px',
          borderRadius: '8px', border: `1px solid ${T.ln}`, background: T.sf2, mb: '9px',
        }}
      >
        <Box
          component="button"
          type="button"
          role="switch"
          aria-checked={artifact.restrictView}
          onClick={() => onSetRestrictView(!artifact.restrictView)}
          sx={{
            flex: '0 0 auto', width: 30, height: 17, borderRadius: '999px', padding: '2px',
            border: `1px solid ${artifact.restrictView ? T.pr : T.ln2}`,
            background: artifact.restrictView ? T.pr : T.sf,
            display: 'flex', justifyContent: artifact.restrictView ? 'flex-end' : 'flex-start',
            cursor: 'pointer', transition: '.14s',
          }}
        >
          <Box sx={{ width: 11, height: 11, borderRadius: '50%', background: artifact.restrictView ? '#fff' : T.dm2 }} />
        </Box>
        <Box sx={{ fontSize: 11.5, lineHeight: 1.5, color: T.dm }}>
          <Box sx={{ fontWeight: 600, color: T.tx, mb: '2px' }}>Restrict view access</Box>
          {artifact.restrictView
            ? 'Only the registrant, editors, and people/departments listed below can view this file.'
            : 'Off — anyone in this project can view this file by default. Turn this on to limit view access to a specific list instead.'}
        </Box>
      </Box>

      {artifact.restrictView && (
        <GrantList
          label="Viewer"
          grants={artifact.viewGrants}
          deptOptions={allDepartments}
          membersByDept={membersByDept}
          loadingDepts={loadingRoster}
          deptError={rosterError}
          onAdd={onAddViewGrant}
          onRemove={onRemoveViewGrant}
        />
      )}
    </Card>
  );
}

function GrantList({
  label, grants, registrant, deptOptions, membersByDept, loadingDepts, deptError, deptHint, onAdd, onRemove,
}: {
  label: string;
  grants: CalypsoGrant[];
  /** 등록자는 목록에 없어도 항상 이 등급이라 별도 chip으로 보여준다(edit 목록에서만). */
  registrant?: string;
  deptOptions: CalypsoDepartment[];
  /** 부서 → 그 부서 소속 knoxId 목록 — 펼쳤을 때만 실명 조회에 쓴다. */
  membersByDept: Record<string, string[]>;
  loadingDepts?: boolean;
  /** 로스터 조회 자체가 실패했다 — "이 project엔 부서가 없다"와 절대 같은 문구로
   * 보여주면 안 된다(사용자가 실제로 겪은 사고: SIREN↔Calypso 토큰이 어긋나 있었는데
   * 화면엔 그냥 "부서 없음"으로만 보였다). */
  deptError?: boolean;
  deptHint?: string;
  onAdd: (g: CalypsoGrantInput) => void;
  onRemove: (g: CalypsoGrantInput) => void;
}) {
  const { resolveUser } = useDirectory();
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const grantedDepts = new Set(grants.filter((g) => g.type === 'department').map((g) => g.department));
  const pickableDepts = deptOptions.filter((d) => !grantedDepts.has(d.id));
  const deptNameById = new Map(deptOptions.map((d) => [d.id, d.name]));

  const toggleExpanded = (d: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mb: '9px' }}>
        <Box sx={{ fontSize: 11.5, fontWeight: 600, color: T.dm }}>{label}</Box>
        {registrant && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserAvatar user={resolveUser(registrant)} size={20} />
            <Box sx={{ fontSize: 13.5, fontWeight: 700, color: T.tx }}>{resolveUser(registrant).name}</Box>
            <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>OWNER</Badge>
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mb: '9px' }}>
        {grants.length === 0 && (
          <Box sx={{ fontSize: 12, color: T.dm2 }}>{registrant ? 'No additional editors yet.' : 'Nobody added yet.'}</Box>
        )}
        {grants.map((g) => (
          <Box
            key={grantKey(g)}
            sx={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px 3px 9px',
              borderRadius: '999px', border: `1px solid ${T.ln}`, background: T.sf,
            }}
          >
            {g.type === 'user' ? (
              <>
                <UserAvatar user={resolveUser(g.knoxId as string)} size={18} />
                <Box sx={{ fontSize: 12 }}>{resolveUser(g.knoxId as string).name}</Box>
              </>
            ) : (
              <Box sx={{ fontSize: 12 }}>{deptNameById.get(g.department as string) ?? g.department} <Box component="span" sx={{ color: T.dm2 }}>(dept)</Box></Box>
            )}
            <SirenButton variant="ghost" onClick={() => onRemove(grantInput(g))} sx={{ minWidth: 0, padding: '2px' }}>
              <Icon name="x" size={11} />
            </SirenButton>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <SirenButton onClick={() => setUserSearchOpen(true)}>
          <Icon name="search" /> Add person
        </SirenButton>
        {loadingDepts ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 11, color: T.dm2 }}>
            <CircularProgress size={11} /> Loading departments…
          </Box>
        ) : deptError ? (
          <Box sx={{ fontSize: 11, color: T.danger }}>
            Couldn&apos;t load the department list — try again shortly.
          </Box>
        ) : pickableDepts.length > 0 && (
          <SirenButton onClick={() => setDeptPickerOpen((o) => !o)}>
            <Icon name="plus" /> Add department
          </SirenButton>
        )}
        {deptHint && !pickableDepts.length && !loadingDepts && !deptError && (
          <Box sx={{ fontSize: 11, color: T.dm2 }}>{deptHint}</Box>
        )}
      </Box>

      {deptPickerOpen && pickableDepts.length > 0 && (
        <Box sx={{ mt: '8px', border: `1px solid ${T.ln}`, borderRadius: '8px', overflow: 'hidden' }}>
          {pickableDepts.map((d) => {
            const members = membersByDept[d.id] ?? [];
            const expanded = expandedDepts.has(d.id);
            return (
              <Box key={d.id} sx={{ borderBottom: `1px solid ${T.ln}`, '&:last-child': { borderBottom: 'none' } }}>
                <Box
                  onClick={() => toggleExpanded(d.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 9px',
                    cursor: CURSOR_POINTER, background: expanded ? T.sf2 : T.sf, '&:hover': { background: T.sf2 },
                  }}
                >
                  <Icon name={expanded ? 'up' : 'dn'} size={10} />
                  <Box sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{d.name}</Box>
                  <Box sx={{ fontSize: 10, color: T.dm2 }}>{members.length} member{members.length === 1 ? '' : 's'}</Box>
                  <SirenButton
                    variant="ghost"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAdd({ type: 'department', department: d.id }); }}
                    sx={{ minWidth: 0, padding: '3px' }}
                    title="Add this department"
                  >
                    <Icon name="plus" size={12} />
                  </SirenButton>
                </Box>
                {expanded && (
                  <Box sx={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px', borderTop: `1px solid ${T.ln}` }}>
                    {/* resolveUser는 아직 캐시에 없는 knoxId를 보면 그때 SDPCommonAPI 조회를
                        예약한다(useDirectory) — 그래서 이 목록을 실제로 펼쳤을 때만 실명
                        조회가 일어난다(사용자 요청: member가 많은 부서라도 접혀 있으면
                        비용이 없다). */}
                    {members.length === 0 && (
                      <Box sx={{ fontSize: 11, color: T.dm2 }}>No members found in this department.</Box>
                    )}
                    {members.map((knoxId) => {
                      const u = resolveUser(knoxId);
                      return (
                        <Box key={knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <UserAvatar user={u} size={16} />
                          <Box sx={{ fontSize: 11 }}>{u.name}</Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {userSearchOpen && (
        <UserSearchDialog
          title={`${label} — add person`}
          excludeKnoxIds={new Set(grants.filter((g) => g.type === 'user').map((g) => g.knoxId as string))}
          onClose={() => setUserSearchOpen(false)}
          onConfirm={(knoxId) => { onAdd({ type: 'user', knoxId }); setUserSearchOpen(false); }}
        />
      )}
    </Box>
  );
}
