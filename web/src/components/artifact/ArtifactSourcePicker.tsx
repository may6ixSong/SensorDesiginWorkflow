import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useArtifactCandidates, useArtifactServices } from '@/api/hooks/useHub';
import { CalypsoArtifact, createCalypsoArtifact, listCalypsoArtifacts } from '@/api/calypsoClient';
import { queryKeys } from '@/api/queryKeys';
import { ArtifactIntent, DepartmentDto } from '@/types/domain';
import { useDepartmentLabel } from '@/hooks/useDepartmentLabel';
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
  departmentOptions: DepartmentDto[];
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

const NETWORK_OPTIONS: readonly ['OA', 'HPC'] = ['OA', 'HPC'];

/**
 * admin이 Service Manage에서 등록한 artifact 종류 하나(예: "RPM" 서비스 아래의
 * "Readout Pattern") — 목록에 뜨는 큰 글자는 **이 등록된 종류 이름**이지, 서비스 자신의
 * 이름이 아니다(사용자 지적: "service명: RPM, artifact명: Readout Pattern이면 Readout
 * Pattern으로 보이게 하라"). 이 이름은 이미 로컬에 있는 값이라 목록을 그릴 때 서버를
 * 부르지 않는다 — **이 행을 클릭했을 때 그제서야** 그 서비스의 실시간 후보를
 * 조회한다(설계서 04장 §6.3 2단계) — project/code/revision으로 즉시 다 긁어와 펼치는
 * 방식은 사용자가 명시적으로 반려했다.
 */
function ArtifactTypeRow({
  workflowId, source, intent, serviceKey, typeName, expanded, onToggle, selectedId, onPick,
}: {
  workflowId: string; source: 'live' | 'hpc'; intent: ArtifactIntent; serviceKey: string; typeName: string;
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
          {typeName}
        </Box>
        <NetworkChip network={source === 'hpc' ? 'HPC' : 'OA'} />
        <ServiceChip source={source} />
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
                  <EditChip level={c.level} />
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}

interface ArtifactTypeEntry {
  serviceKey: string;
  source: 'live' | 'hpc';
  typeKey: string;
  typeName: string;
}

const typeRowKey = (e: ArtifactTypeEntry) => `${e.serviceKey}::${e.typeKey}`;

/**
 * "새 Artifact 추가"와 "산출물 변경" 양쪽이 공유하는 소스 선택 UI(설계서 04장 §6) —
 * admin이 등록한 OA/HPC Service와 Calypso(File Artifacts) 산출물을 하나의 목록으로
 * 섞어 보여준다. 각 줄의 큰 글자는 **Service Manage에서 admin이 등록한 artifact 종류
 * 이름**이다(예: 서비스명 "RPM"에 등록한 artifact명 "Readout Pattern"이면 "Readout
 * Pattern"으로 뜬다) — 이 값은 이미 로컬에 다 있어서 목록을 그릴 때 서버를 부르지
 * 않는다. 그 줄을 클릭해 펼쳐야 **그제서야** 그 서비스의 실시간 후보를 조회한다(§6.3
 * 2단계) — 목록을 열자마자 모든 서비스에 실제 project/code/revision 검색을 날려
 * 매칭되는 인스턴스를 전부 평평하게 보여주던 방식은 사용자가 반려했다. Tier 글자는
 * 절대 노출하지 않는다.
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
  // Calypso artifact의 department 표시는 전사 고정 6종이 아니라 이 artifact가 속한
  // SIREN project의 부서 목록에서 찾아야 한다(설계서 02장 §9.5 — 이전엔 잘못된 테이블을
  // 봤던 기존 버그를 여기서 함께 고친다).
  const { label: deptLabel } = useDepartmentLabel(projectId);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newNetwork, setNewNetwork] = useState<'OA' | 'HPC'>('OA');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const didInitialExpand = useRef(false);

  const { data: allServices, isLoading: loadingServices } = useArtifactServices();
  const { data: calypsoArtifacts, isLoading: loadingCalypso } = useQuery({
    queryKey: queryKeys.calypsoArtifacts(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => listCalypsoArtifacts({ projectId: projectId as string }),
  });

  const term = query.trim().toLowerCase();
  const services = useMemo(
    () => (allServices ?? []).filter((s) => s.transport === 'http'),
    [allServices],
  );
  // 서비스 하나가 여러 artifact 종류를 등록할 수 있으므로(설계서 07장 §3.1) 종류별로
  // 따로 한 줄씩 뽑는다 — 종류가 하나도 등록 안 된(레거시) 서비스는 서비스 자신의
  // 이름으로 종류 하나인 것처럼 취급한다(스키마 주석과 동일한 규칙).
  const typeEntries = useMemo<ArtifactTypeEntry[]>(() => {
    const out: ArtifactTypeEntry[] = [];
    for (const s of services) {
      const source: 'live' | 'hpc' = s.defaultTier === 'C' ? 'hpc' : 'live';
      if (s.artifactTypes.length) {
        for (const t of s.artifactTypes) out.push({ serviceKey: s.key, source, typeKey: t.key, typeName: t.name });
      } else {
        out.push({ serviceKey: s.key, source, typeKey: s.key, typeName: s.name });
      }
    }
    return out;
  }, [services]);
  const filteredTypeEntries = useMemo(
    () => typeEntries.filter((e) => !term || e.typeName.toLowerCase().includes(term)),
    [typeEntries, term],
  );
  const calypsoList = useMemo(
    // 검색은 사람이 입력한 말로 하므로 부서는 id가 아니라 **이름**으로 대조한다(02장 §9.3) —
    // id로 두면 부서명을 쳐도 아무것도 걸리지 않는다.
    () => (calypsoArtifacts ?? [])
      .filter((a) => !term || `${a.name} ${deptLabel(a.department)}`.toLowerCase().includes(term)),
    [calypsoArtifacts, term, deptLabel],
  );

  // 이미 live/hpc 산출물을 골라 둔 상태로 열렸으면(산출물 변경 등) 그 서비스에 속한
  // 종류 행을 펼쳐서 현재 선택을 바로 보여준다 — 딱 한 번만, 그 뒤로는 사용자가
  // 직접 펼치고 접는 대로 둔다.
  useEffect(() => {
    if (didInitialExpand.current) return;
    if (state.source !== 'live' && state.source !== 'hpc') return;
    if (!state.serviceKey || !typeEntries.length) return;
    const matches = typeEntries.filter((e) => e.serviceKey === state.serviceKey).map(typeRowKey);
    if (matches.length) {
      setExpandedKeys(new Set(matches));
      didInitialExpand.current = true;
    }
  }, [typeEntries, state.source, state.serviceKey]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const needsDeptPicker = myDepartments.length !== 1;
  const fallbackDept = departmentOptions[0]?.id ?? myDepartments[0] ?? '';
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
    mutationFn: () => createCalypsoArtifact({
      projectId: projectId as string,
      department: effectiveDept,
      name: newName.trim(),
      network: newNetwork,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifacts(projectId as string) });
      pickCalypso(created);
      setNewName('');
      setNewNetwork('OA');
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
                options={departmentOptions.map((d) => ({ value: d.id, label: d.name }))}
              />
            )}
            <Box>
              <Box sx={{ fontSize: 10.5, color: T.dm2, mb: '5px' }}>Network — can be changed later from the artifact detail</Box>
              <Box sx={{ display: 'flex', gap: '4px' }}>
                {NETWORK_OPTIONS.map((n) => (
                  <Box
                    key={n}
                    component="button"
                    type="button"
                    onClick={() => setNewNetwork(n)}
                    sx={{
                      fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: '999px',
                      cursor: CURSOR_POINTER,
                      background: n === newNetwork ? T.pr : T.sf,
                      color: n === newNetwork ? '#fff' : T.dm,
                      border: `1px solid ${n === newNetwork ? T.pr : T.ln2}`,
                    }}
                  >
                    {n}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: '8px' }}>
              <SirenButton
                variant="primary"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </SirenButton>
              <SirenButton onClick={() => { setCreating(false); setNewName(''); setNewNetwork('OA'); }}>Cancel</SirenButton>
            </Box>
            <Box sx={{ fontSize: 10.5, color: T.dm2, lineHeight: 1.6 }}>
              This only registers an empty artifact. Add its first version — matching the network above —
              from the artifact detail once it&apos;s on the canvas.
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
            계속 "Loading…"에 멈춰 있었다). 여기서 뜨는 건 등록된 artifact 종류 이름뿐이라
            서비스 목록만 오면 바로 그릴 수 있다 — 실시간 후보 조회는 각 행을 펼칠 때
            ArtifactTypeRow 안에서 개별적으로 일어난다. */}
        {loadingServices ? loadingRow('Loading services…') : (
          filteredTypeEntries.map((e) => {
            const key = typeRowKey(e);
            return (
              <ArtifactTypeRow
                key={key}
                workflowId={workflowId}
                source={e.source}
                intent={intent}
                serviceKey={e.serviceKey}
                typeName={e.typeName}
                expanded={expandedKeys.has(key)}
                onToggle={() => toggleExpanded(key)}
                selectedId={state.source === e.source && state.serviceKey === e.serviceKey ? state.liveArtifactId : ''}
                onPick={(id, name) => pickLive(e.serviceKey, e.source, id, name)}
              />
            );
          })
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
                  {deptLabel(a.department)}
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

        {!loadingServices && !loadingCalypso && !filteredTypeEntries.length && !calypsoList.length && (
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
