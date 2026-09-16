import { useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useArtifactCandidates, useArtifactServices } from '@/api/hooks/useHub';
import { CalypsoArtifact, createCalypsoArtifact, listCalypsoArtifacts } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ArtifactIntent } from '@/types/domain';
import { departmentName } from '@/shared/constants/departments';
import { Field, SelectInput, TextInput } from '@/components/common/Panel';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

export type ArtifactSourceKind = 'live' | 'file' | 'hpc';

export interface ArtifactSourceState {
  source: ArtifactSourceKind | null;
  serviceKey: string;
  liveArtifactId: string;
  calypsoArtifactId: string;
}

export const emptySourceState = (): ArtifactSourceState => ({
  source: null,
  serviceKey: '',
  liveArtifactId: '',
  calypsoArtifactId: '',
});

interface Props {
  workflowId: string;
  projectId: string | undefined;
  intent: ArtifactIntent;
  myDepartments: string[];
  departmentOptions: string[];
  state: ArtifactSourceState;
  onChange: (next: ArtifactSourceState) => void;
  /** 후보를 고르면 이름 필드가 비어 있을 때만 자동으로 채워 준다. */
  onSelectName?: (name: string) => void;
}

const rowSx = (sel: boolean, pickable: boolean) => ({
  display: 'flex', alignItems: 'center', gap: '8px',
  cursor: pickable ? CURSOR_POINTER : 'not-allowed',
  opacity: pickable ? 1 : 0.5,
  padding: '8px 10px', borderRadius: '8px',
  background: sel ? T.prSoft : T.sf,
  border: `1px solid ${sel ? T.prLine : T.ln}`,
  '&:hover': pickable ? { borderColor: sel ? T.prLine : T.ln2 } : undefined,
});

const radioSx = (sel: boolean) => ({
  width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
  border: `2px solid ${sel ? T.pr : T.ln3}`,
  background: sel ? T.pr : 'transparent',
});

/** OA/HPC Service 한 줄 — 펼치면 그 서비스의 실시간 후보가 아래에 뜬다(설계서 04장 §6.3 2단계). */
function ServiceRow({
  workflowId, source, intent, serviceKey, name, expanded, onToggle, selectedId, onPick,
}: {
  workflowId: string; source: 'live' | 'hpc'; intent: ArtifactIntent; serviceKey: string; name: string;
  expanded: boolean; onToggle: () => void; selectedId: string; onPick: (id: string, name: string) => void;
}) {
  const { data: result, isLoading } = useArtifactCandidates(workflowId, source, intent, serviceKey, expanded);
  return (
    <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '8px', overflow: 'hidden' }}>
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
          cursor: CURSOR_POINTER, background: expanded ? T.sf2 : T.sf,
          '&:hover': { background: T.sf2 },
        }}
      >
        <Icon name={expanded ? 'up' : 'dn'} size={11} />
        <Box sx={{ flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </Box>
        <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
          {source === 'live' ? 'OA SERVICE' : 'HPC SERVICE'}
        </Badge>
      </Box>
      {expanded && (
        <Box sx={{ padding: '8px 10px', borderTop: `1px solid ${T.ln}`, display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12, color: T.dm2 }}>
              <CircularProgress size={13} /> Loading artifacts…
            </Box>
          ) : !result?.supported ? (
            <Box sx={{ fontSize: 11.5, color: T.dm, lineHeight: 1.6 }}>
              {result?.note ?? "This service doesn't support browsing artifacts within a project."}
            </Box>
          ) : !result.candidates.length ? (
            <Box sx={{ fontSize: 11.5, color: T.dm }}>No artifacts found in that project.</Box>
          ) : (
            result.candidates.map((c) => {
              const sel = selectedId === c.externalArtifactId;
              return (
                <Box
                  key={c.externalArtifactId}
                  onClick={() => { if (c.pickable) onPick(c.externalArtifactId, c.name); }}
                  sx={rowSx(sel, c.pickable)}
                >
                  <Box sx={radioSx(sel)} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </Box>
                    {c.currentVersionLabel && (
                      <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '2px' }}>{c.currentVersionLabel}</Box>
                    )}
                    {!c.pickable && (
                      <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '2px' }}>
                        {c.level === 'view' ? 'view only — needs edit access to give this' : 'no access'}
                      </Box>
                    )}
                  </Box>
                  {c.level && (
                    <Badge
                      color={c.level === 'edit' ? T.pr : T.dm}
                      bg={c.level === 'edit' ? T.prSoft : T.sf2}
                      borderColor={c.level === 'edit' ? T.prLine : T.ln}
                    >
                      {c.level === 'edit' ? 'EDIT' : 'VIEW'}
                    </Badge>
                  )}
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * "새 Artifact 추가"와 "산출물 변경" 양쪽이 공유하는 소스 선택 UI(설계서 04장 §6) —
 * admin이 등록한 OA/HPC Service와 Calypso(File Artifacts) 산출물을 **하나의 목록**으로
 * 보여준다. Service 항목을 펼치면 그 서비스의 실시간 후보가 안에 뜨고(§6.3 2단계 그대로),
 * Calypso 항목은 바로 고를 수 있다. Tier 글자는 절대 노출하지 않는다.
 *
 * ★ Tier D(External/Attested)는 폐기했다 — File Artifacts로 새로 등록하면서
 *   OA-link/HPC-path 콘텐츠를 고를 수 있어(등록 자체는 이 목록 맨 아래 "새로 등록"에서
 *   이름만 받고, 어떤 콘텐츠로 채울지는 등록 직후 그 artifact의 contents 화면에서
 *   정한다 — 04장 §2.2, §6.4), 예전에 D가 받는 쪽 전용으로 하던 case까지 이 3개
 *   소스 안에서 커버된다.
 */
export function ArtifactSourcePicker({
  workflowId, projectId, intent, myDepartments, departmentOptions,
  state, onChange, onSelectName,
}: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [expandedService, setExpandedService] = useState<string | null>(
    state.source === 'live' || state.source === 'hpc' ? state.serviceKey : null,
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');

  const { data: allServices, isLoading: loadingServices } = useArtifactServices();
  const { data: calypsoArtifacts, isLoading: loadingCalypso } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => listCalypsoArtifacts({ projectId: projectId as string }),
  });

  const term = query.trim().toLowerCase();
  const services = useMemo(
    () => (allServices ?? [])
      .filter((s) => s.transport === 'http')
      .filter((s) => !term || s.name.toLowerCase().includes(term)),
    [allServices, term],
  );
  const calypsoList = useMemo(
    () => (calypsoArtifacts ?? [])
      .filter((a) => !term || `${a.name} ${a.department}`.toLowerCase().includes(term)),
    [calypsoArtifacts, term],
  );

  const needsDeptPicker = myDepartments.length !== 1;
  const fallbackDept = departmentOptions[0] ?? myDepartments[0] ?? '';
  const effectiveDept = needsDeptPicker ? (newDept || fallbackDept) : myDepartments[0];

  const pickLive = (serviceKey: string, source: 'live' | 'hpc', id: string, name: string) => {
    onChange({ ...emptySourceState(), source, serviceKey, liveArtifactId: id });
    onSelectName?.(name);
  };

  const pickCalypso = (a: CalypsoArtifact) => {
    onChange({ ...emptySourceState(), source: 'file', calypsoArtifactId: a.id });
    onSelectName?.(a.name);
    setCreating(false);
  };

  const createMutation = useMutation({
    mutationFn: () => createCalypsoArtifact({ projectId: projectId as string, department: effectiveDept, name: newName.trim() }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(projectId as string) });
      pickCalypso(created);
      setNewName('');
      toast('File Artifact created — add its first version from the artifact detail once it\'s on the canvas.');
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not create the artifact'),
  });

  return (
    <Field label="Where does it come from?">
      <TextInput value={query} onChange={setQuery} placeholder="Search services or file artifacts" />
      <Box sx={{ mt: '8px', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loadingServices || loadingCalypso ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading…
          </Box>
        ) : (
          <>
            {services.map((s) => {
              const source: 'live' | 'hpc' = s.defaultTier === 'C' ? 'hpc' : 'live';
              return (
                <ServiceRow
                  key={s.key}
                  workflowId={workflowId}
                  source={source}
                  intent={intent}
                  serviceKey={s.key}
                  name={s.name}
                  expanded={expandedService === s.key}
                  onToggle={() => setExpandedService(expandedService === s.key ? null : s.key)}
                  selectedId={state.source === source && state.serviceKey === s.key ? state.liveArtifactId : ''}
                  onPick={(id, name) => pickLive(s.key, source, id, name)}
                />
              );
            })}

            {calypsoList.map((a) => {
              const sel = state.source === 'file' && state.calypsoArtifactId === a.id;
              const pickable = intent !== 'own' || a.myAccess === 'edit';
              return (
                <Box key={a.id} onClick={() => { if (pickable) pickCalypso(a); }} sx={rowSx(sel, pickable)}>
                  <Box sx={radioSx(sel)} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </Box>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '2px' }}>
                      {departmentName(a.department)}
                      {!pickable ? ' · view only — needs edit access to give this' : ''}
                    </Box>
                  </Box>
                  <Badge
                    color={a.myAccess === 'edit' ? T.pr : T.dm}
                    bg={a.myAccess === 'edit' ? T.prSoft : T.sf2}
                    borderColor={a.myAccess === 'edit' ? T.prLine : T.ln}
                  >
                    {a.myAccess === 'edit' ? 'EDIT' : 'VIEW'}
                  </Badge>
                </Box>
              );
            })}

            {!services.length && !calypsoList.length && (
              <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
                No match for that search.
              </Box>
            )}
          </>
        )}

        {creating ? (
          <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Box sx={{ fontSize: 11.5, fontWeight: 700 }}>New File Artifact</Box>
            <TextInput value={newName} onChange={setNewName} placeholder="Name" autoFocus />
            {needsDeptPicker && (
              <SelectInput
                value={effectiveDept}
                onChange={setNewDept}
                options={departmentOptions.map((d) => ({ value: d, label: departmentName(d) }))}
              />
            )}
            <Box sx={{ display: 'flex', gap: '8px' }}>
              <SirenButton
                variant="primary"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </SirenButton>
              <SirenButton onClick={() => { setCreating(false); setNewName(''); }}>Cancel</SirenButton>
            </Box>
            <Box sx={{ fontSize: 10.5, color: T.dm2, lineHeight: 1.6 }}>
              This only registers an empty artifact. Choose File / OA link / HPC path when you add its
              first version from the artifact detail.
            </Box>
          </Box>
        ) : (
          <Box
            component="button"
            type="button"
            onClick={() => setCreating(true)}
            sx={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: 12, fontWeight: 600,
              color: T.pr, background: 'transparent', border: `1px dashed ${T.prLine}`, borderRadius: '8px',
              padding: '8px 10px', cursor: CURSOR_POINTER, '&:hover': { background: T.prSoft },
            }}
          >
            <Icon name="plus" size={12} /> Create new File Artifact
          </Box>
        )}
      </Box>
    </Field>
  );
}

/** state → newArtifact 페이로드. 아직 고르는 중(source가 완결되지 않음)이면 null. */
export function resolveNewArtifact(
  state: ArtifactSourceState,
  name: string,
): { source: 'live' | 'file' | 'hpc'; name: string; serviceKey?: string; externalArtifactId?: string } | null {
  if ((state.source === 'live' || state.source === 'hpc') && state.serviceKey && state.liveArtifactId) {
    return { source: state.source, name, serviceKey: state.serviceKey, externalArtifactId: state.liveArtifactId };
  }
  if (state.source === 'file' && state.calypsoArtifactId) {
    return { source: 'file', name, externalArtifactId: state.calypsoArtifactId };
  }
  return null;
}
