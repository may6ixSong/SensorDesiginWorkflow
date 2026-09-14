import { Box, CircularProgress } from '@mui/material';
import { AccessGrant, ArtifactIntent } from '@/types/domain';
import { Field } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { AccessGrantEditor } from '@/components/dialogs/AccessGrantEditor';
import { CalypsoArtifactPicker } from '@/components/artifact/CalypsoArtifactPicker';
import { LiveServiceArtifactPicker } from '@/components/artifact/LiveServiceArtifactPicker';
import { useArtifactCandidates } from '@/api/hooks/useHub';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

export type ArtifactSourceKind = 'live' | 'file' | 'hpc' | 'attested';

const SOURCE_LABEL: Record<ArtifactSourceKind, string> = {
  live: 'Live Service',
  file: 'File Artifacts',
  hpc: 'HPC Path',
  attested: 'External / Attested',
};

export interface ArtifactSourceState {
  source: ArtifactSourceKind | null;
  serviceKey: string;
  liveArtifactId: string;
  calypsoArtifactId: string;
  expectedGiver: AccessGrant;
}

export const emptySourceState = (): ArtifactSourceState => ({
  source: null,
  serviceKey: '',
  liveArtifactId: '',
  calypsoArtifactId: '',
  expectedGiver: { departments: [], users: [] },
});

interface Props {
  workflowId: string;
  projectId: string | undefined;
  projectCode: string | undefined;
  projectRevision: string | undefined;
  intent: ArtifactIntent;
  myDepartments: string[];
  departmentOptions: string[];
  state: ArtifactSourceState;
  onChange: (next: ArtifactSourceState) => void;
  /** 후보를 고르면 이름 필드가 비어 있을 때만 자동으로 채워 준다. */
  onSelectName?: (name: string) => void;
}

/**
 * "새 Artifact 추가"와 "산출물 변경" 양쪽이 공유하는 소스 선택 UI(설계서 04장 §6).
 * Tier 글자는 절대 노출하지 않는다 — Live Service/File Artifacts/HPC Path(+받는 쪽만
 * External/Attested)로만 보여준다. HPC Path는 항상 잠겨 있고 미리보기만 제공한다.
 */
export function ArtifactSourcePicker({
  workflowId, projectId, projectCode, projectRevision, intent, myDepartments, departmentOptions,
  state, onChange, onSelectName,
}: Props) {
  const options: ArtifactSourceKind[] = intent === 'own' ? ['live', 'file', 'hpc'] : ['live', 'file', 'hpc', 'attested'];
  const hpcPreview = useArtifactCandidates(workflowId, 'hpc', intent, undefined, state.source === 'hpc');

  return (
    <>
      <Field label="Where does it come from?">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {options.map((s) => (
            <Box
              key={s}
              component="button"
              type="button"
              onClick={() => onChange({ ...emptySourceState(), source: s })}
              sx={{
                fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: `${R.sm}px`,
                cursor: CURSOR_POINTER, transition: '.14s',
                background: state.source === s ? T.prSoft : T.sf,
                border: `1px solid ${state.source === s ? T.pr : T.ln2}`,
                color: state.source === s ? T.pr : T.dm,
              }}
            >
              {SOURCE_LABEL[s]}
            </Box>
          ))}
        </Box>
      </Field>

      {state.source === 'live' && (
        <LiveServiceArtifactPicker
          workflowId={workflowId}
          projectCode={projectCode}
          projectRevision={projectRevision}
          intent={intent}
          serviceKey={state.serviceKey}
          onServiceChange={(v) => onChange({ ...state, serviceKey: v })}
          externalArtifactId={state.liveArtifactId}
          onChange={(v) => onChange({ ...state, liveArtifactId: v })}
          onSelectName={onSelectName}
        />
      )}

      {state.source === 'file' && (
        <CalypsoArtifactPicker
          projectId={projectId}
          myDepartments={myDepartments}
          value={state.calypsoArtifactId}
          onChange={(v) => onChange({ ...state, calypsoArtifactId: v })}
          onSelectName={onSelectName}
          intent={intent}
        />
      )}

      {state.source === 'hpc' && (
        <Field label="HPC Path — not integrated yet">
          <Box
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              background: T.warnSoft, border: `1px solid ${T.warnLine}`, color: T.warn,
              borderRadius: `${R.sm}px`, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, mb: '10px',
            }}
          >
            <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="warn" /></Box>
            <Box>HPC Path artifacts can&apos;t be selected yet — shown below for preview only.</Box>
          </Box>
          {hpcPreview.isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
              <CircularProgress size={13} /> Loading…
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {(hpcPreview.data?.candidates ?? []).map((c) => (
                <Box
                  key={c.externalArtifactId}
                  sx={{
                    fontSize: 12.5, padding: '8px 10px', borderRadius: '8px', opacity: 0.6,
                    background: T.sf, border: `1px solid ${T.ln}`,
                  }}
                >
                  <Box sx={{ fontWeight: 600 }}>{c.name}</Box>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>
                    {c.currentVersionLabel}
                  </Box>
                </Box>
              ))}
              {!hpcPreview.data?.candidates.length && (
                <Box sx={{ fontSize: 11.5, color: T.dm2 }}>No preview data for this project.</Box>
              )}
            </Box>
          )}
        </Field>
      )}

      {state.source === 'attested' && (
        <Field label="Who is expected to give this? — informational only, not an access grant">
          <AccessGrantEditor
            value={state.expectedGiver}
            onChange={(v) => onChange({ ...state, expectedGiver: v })}
            departmentOptions={departmentOptions}
          />
        </Field>
      )}
    </>
  );
}

/** state → newArtifact 페이로드. 아직 고르는 중(source가 완결되지 않음)이면 null. */
export function resolveNewArtifact(
  state: ArtifactSourceState,
  name: string,
): { source: 'live' | 'file' | 'attested'; name: string; serviceKey?: string; externalArtifactId?: string; expectedGiver?: AccessGrant } | null {
  if (state.source === 'live' && state.serviceKey && state.liveArtifactId) {
    return { source: 'live', name, serviceKey: state.serviceKey, externalArtifactId: state.liveArtifactId };
  }
  if (state.source === 'file' && state.calypsoArtifactId) {
    return { source: 'file', name, externalArtifactId: state.calypsoArtifactId };
  }
  if (state.source === 'attested') {
    return { source: 'attested', name, expectedGiver: state.expectedGiver };
  }
  return null;
}
