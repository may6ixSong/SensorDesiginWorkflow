import { Box } from '@mui/material';
import { ArtifactIntent } from '@/types/domain';
import { Field } from '@/components/common/Panel';
import { CalypsoArtifactPicker } from '@/components/artifact/CalypsoArtifactPicker';
import { OAServiceArtifactPicker } from '@/components/artifact/OAServiceArtifactPicker';
import { CURSOR_POINTER, R, T } from '@/theme/tokens';

export type ArtifactSourceKind = 'live' | 'file' | 'hpc';

const SOURCE_LABEL: Record<ArtifactSourceKind, string> = {
  live: 'OA Service',
  file: 'File Artifacts',
  hpc: 'HPC Service',
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
 * Tier 글자는 절대 노출하지 않는다 — OA Service/File Artifacts/HPC Service로만 보여준다.
 *
 * ★ HPC Service(C)는 더 이상 "항상 잠김"이 아니다 — HPC망과의 양방향 API 연동이
 *   확정되면서 OA Service(A)와 완전히 같은 흐름(서비스 선택 → 실시간 후보 조회 →
 *   pickable 판정)을 쓴다(설계서 04장 §2, §6.2, §6.3). 그래서 OAServiceArtifactPicker를
 *   `source` prop만 바꿔 그대로 재사용한다.
 * ★ Tier D(External/Attested — 받는 쪽 전용 4번째 버튼이었다)는 폐기했다. File
 *   Artifacts(B, Calypso)가 OA-link/HPC-path 참조형 콘텐츠까지 갖도록 넓어지면서 D의
 *   역할을 대체했으므로, 지금은 주는/받는 양쪽 다 이 3개 소스만 있다.
 *
 * TODO(설계서 04장 §6): 지금은 3개 버튼(OA Service/File Artifacts/HPC Service)으로
 *   source를 먼저 고르는 방식인데, 최종 목표는 admin이 등록한 OA/HPC Service와 Calypso
 *   산출물을 한데 합친 **단일 목록**이다 — OA/HPC Service 항목을 고르면 그 서비스의
 *   실시간 후보를(§6.3 2단계 그대로), Calypso 항목을 고르면 바로 매핑한다. 이 다이얼로그
 *   재구성은 이번 변경 범위 밖이다.
 */
export function ArtifactSourcePicker({
  workflowId, projectId, intent,
  state, onChange, onSelectName,
}: Props) {
  const options: ArtifactSourceKind[] = ['live', 'file', 'hpc'];

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
): { source: 'live' | 'file' | 'hpc'; name: string; serviceKey?: string; externalArtifactId?: string } | null {
  if ((state.source === 'live' || state.source === 'hpc') && state.serviceKey && state.liveArtifactId) {
    return { source: state.source, name, serviceKey: state.serviceKey, externalArtifactId: state.liveArtifactId };
  }
  if (state.source === 'file' && state.calypsoArtifactId) {
    return { source: 'file', name, externalArtifactId: state.calypsoArtifactId };
  }
  return null;
}
