import { useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LiveCandidateRow, useAllLiveCandidates, useArtifactServices } from '@/api/hooks/useHub';
import { CalypsoArtifact, createCalypsoArtifact, listCalypsoArtifacts } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ArtifactIntent } from '@/types/domain';
import { departmentName } from '@/shared/constants/departments';
import { Field, SelectInput, TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';
import { EditChip, NetworkChip, ServiceChip } from './ArtifactChips';

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

/**
 * OA/HPC Service 후보 한 줄 — File Artifacts(Calypso) 행과 완전히 같은 자리에, 같은
 * 모양으로 선다(사용자 요청: 서비스별로 접어두지 말고 처음부터 하나의 목록으로 섞어
 * 보여줄 것). 큰 글자는 **그 artifact 자신의 이름**이고(서비스 이름이 아니다), 서비스
 * 이름은 부제목으로만 작게 붙는다.
 */
function LiveCandidateItemRow({
  candidate, selectedId, onPick,
}: {
  candidate: LiveCandidateRow;
  selectedId: string;
  onPick: (id: string, name: string) => void;
}) {
  const c = candidate;
  const sel = selectedId === c.externalArtifactId;
  return (
    <Box onClick={() => { if (c.pickable) onPick(c.externalArtifactId, c.name); }} sx={rowSx(sel, c.pickable)}>
      <Box sx={radioSx(sel)} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </Box>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '2px' }}>
          {c.serviceName}{c.currentVersionLabel ? ` · ${c.currentVersionLabel}` : ''}
        </Box>
        {!c.pickable && (
          <Box sx={{ fontSize: 10.5, color: T.dm2, mt: '2px' }}>
            {c.level === 'view' ? 'view only — needs edit access to give this' : 'no access'}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flex: '0 0 auto' }}>
        <EditChip level={c.level} />
        <NetworkChip network={c.source === 'hpc' ? 'HPC' : 'OA'} />
        <ServiceChip source={c.source} />
      </Box>
    </Box>
  );
}

/**
 * "새 Artifact 추가"와 "산출물 변경" 양쪽이 공유하는 소스 선택 UI(설계서 04장 §6) —
 * admin이 등록한 OA/HPC Service와 Calypso(File Artifacts) 산출물을 **처음부터 하나의
 * 평평한 목록**으로 섞어 보여준다(사용자 요청 — 예전에는 서비스 행을 펼쳐야만, 또는
 * 검색을 해야만 OA/HPC 후보가 보였다). 각 줄의 큰 글자는 **그 artifact 자신의 이름**이고
 * (서비스 이름이 아니다), 어느 서비스에서 왔는지는 작은 부제목으로만 붙는다. Tier
 * 글자는 절대 노출하지 않는다.
 *
 * ★ Tier D(External/Attested)는 폐기했다 — File Artifacts로 새로 등록하면서
 *   OA-link/HPC-path 콘텐츠를 고를 수 있어(등록 자체는 이 목록 맨 위 "새로 등록"에서
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');

  const { data: allServices, isLoading: loadingServices } = useArtifactServices();
  const { data: calypsoArtifacts, isLoading: loadingCalypso } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => listCalypsoArtifacts({ projectId: projectId as string }),
  });

  // 검색은 각 후보 자신의 이름(+ Calypso는 부서, live는 서비스 이름)으로 건다 — 그래서
  // services 자체는 여기서 미리 걸러내지 않는다(그러면 후보를 펼쳐볼 기회도 없이 서비스
  // 행째로 사라진다). live 후보 각각의 필터링은 렌더링 시점에 한다.
  const term = query.trim().toLowerCase();
  const services = useMemo(
    () => (allServices ?? []).filter((s) => s.transport === 'http'),
    [allServices],
  );
  const { candidates: liveCandidates, loadingKeys: liveLoadingKeys } = useAllLiveCandidates(workflowId, intent, services);
  const filteredLiveCandidates = useMemo(
    () => liveCandidates.filter(
      (c) => !term || c.name.toLowerCase().includes(term) || c.serviceName.toLowerCase().includes(term),
    ),
    [liveCandidates, term],
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
      toast('Artifact created — add its first version from the artifact detail once it\'s on the canvas.');
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not create the artifact'),
  });

  const loadingRow = (label: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
      <CircularProgress size={13} /> {label}
    </Box>
  );

  return (
    <Field label="Artifact Source">
      <TextInput value={query} onChange={setQuery} placeholder="Search services or file artifacts" />
      <Box sx={{ mt: '8px', maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Tier B가 이제 File 전용이 아니게 되면서(OA-link/HPC-path도 등록 가능) 맨 위로
            올려 뒀다(사용자 요청) — 목록 맨 아래에 묻혀 있으면 그 사실이 눈에 안 띈다. */}
        {creating ? (
          <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Box sx={{ fontSize: 11.5, fontWeight: 700 }}>New Artifact</Box>
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
            <Icon name="plus" size={12} /> Create new Artifact
          </Box>
        )}

        {/* OA/HPC Service 후보와 File Artifacts(Calypso)를 독립된 로딩으로 그린다 — 하나가
            느리거나 응답을 못 받아도(예: Calypso가 내려가 있음) 이미 도착한 다른 쪽까지
            같이 숨어버리면 안 된다(사용자가 실제로 겪은 문제 — 후자가 안 끝나서 전체가
            계속 "Loading…"에 멈춰 있었다). live 쪽은 등록된 서비스 개수만큼 병렬로
            받아오므로(useAllLiveCandidates) 서비스 목록 자체를 못 받아왔을 때와
            그 후보들을 아직 받는 중일 때를 각각 보여준다. */}
        {loadingServices ? loadingRow('Loading services…') : (
          <>
            {filteredLiveCandidates.map((c) => (
              <LiveCandidateItemRow
                key={c.externalArtifactId}
                candidate={c}
                selectedId={state.source === c.source && state.serviceKey === c.serviceKey ? state.liveArtifactId : ''}
                onPick={(id, name) => pickLive(c.serviceKey, c.source, id, name)}
              />
            ))}
            {liveLoadingKeys.length > 0 && loadingRow(`Loading ${liveLoadingKeys.join(', ')}…`)}
          </>
        )}

        {loadingCalypso ? loadingRow('Loading file artifacts…') : calypsoList.map((a) => {
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
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flex: '0 0 auto' }}>
                <EditChip level={a.myAccess} />
                <NetworkChip network={a.network} />
              </Box>
            </Box>
          );
        })}

        {!loadingServices && !loadingCalypso && !liveLoadingKeys.length && !filteredLiveCandidates.length && !calypsoList.length && (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            No match for that search.
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
