import { Box } from '@mui/material';
import { ArtifactIntent } from '@/types/domain';
import { Field } from '@/components/common/Panel';
import { CalypsoArtifactPicker } from '@/components/artifact/CalypsoArtifactPicker';
import { OAServiceArtifactPicker } from '@/components/artifact/OAServiceArtifactPicker';
import { CURSOR_POINTER, R, T } from '@/theme/tokens';

export type ArtifactSourceKind = 'live' | 'file' | 'hpc' | 'attested';

const SOURCE_LABEL: Record<ArtifactSourceKind, string> = {
  live: 'OA Service',
  file: 'File Artifacts',
  hpc: 'HPC Service',
  attested: 'External / Attested',
};

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

/**
 * "새 Artifact 추가"와 "산출물 변경" 양쪽이 공유하는 소스 선택 UI(설계서 04장 §6).
 * Tier 글자는 절대 노출하지 않는다 — OA Service/File Artifacts/HPC Service(+받는 쪽만
 * External/Attested)로만 보여준다.
 *
 * ★ HPC Service(C)는 더 이상 "항상 잠김"이 아니다 — HPC망과의 양방향 API 연동이
 *   확정되면서 OA Service(A)와 완전히 같은 흐름(서비스 선택 → 실시간 후보 조회 →
 *   pickable 판정)을 쓴다(설계서 04장 §2, §6.2, §6.3). 그래서 OAServiceArtifactPicker를
 *   `source` prop만 바꿔 그대로 재사용한다.
 */
export function ArtifactSourcePicker({
  workflowId, projectId, intent,
  state, onChange, onSelectName,
}: Props) {
  const options: ArtifactSourceKind[] = intent === 'own' ? ['live', 'file', 'hpc'] : ['live', 'file', 'hpc', 'attested'];

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

      {(state.source === 'live' || state.source === 'hpc') && (
        <OAServiceArtifactPicker
          workflowId={workflowId}
          source={state.source}
          intent={intent}
          serviceKey={state.serviceKey}
          // serviceKey와 liveArtifactId 초기화를 **한 번의 setState**로 묶는다 — 따로
          // 나눠 부르면 같은 이벤트 틱 안에서 두 번째 호출이 첫 번째 변경을 덮어쓴다.
          onServiceChange={(v) => onChange({ ...state, serviceKey: v, liveArtifactId: '' })}
          externalArtifactId={state.liveArtifactId}
          onChange={(v) => onChange({ ...state, liveArtifactId: v })}
          onSelectName={onSelectName}
        />
      )}

      {state.source === 'file' && (
        <CalypsoArtifactPicker
          projectId={projectId}
          value={state.calypsoArtifactId}
          onChange={(v) => onChange({ ...state, calypsoArtifactId: v })}
          onSelectName={onSelectName}
          intent={intent}
        />
      )}
    </>
  );
}

/** state → newArtifact 페이로드. 아직 고르는 중(source가 완결되지 않음)이면 null. */
export function resolveNewArtifact(
  state: ArtifactSourceState,
  name: string,
): { source: 'live' | 'file' | 'hpc' | 'attested'; name: string; serviceKey?: string; externalArtifactId?: string } | null {
  if ((state.source === 'live' || state.source === 'hpc') && state.serviceKey && state.liveArtifactId) {
    return { source: state.source, name, serviceKey: state.serviceKey, externalArtifactId: state.liveArtifactId };
  }
  if (state.source === 'file' && state.calypsoArtifactId) {
    return { source: 'file', name, externalArtifactId: state.calypsoArtifactId };
  }
  if (state.source === 'attested') {
    return { source: 'attested', name };
  }
  return null;
}
