import { Box, CircularProgress } from '@mui/material';
import { HubService } from '@/hooks/useHubServices';
import { useProjectSearchCandidates } from '@/api/hooks/useHub';
import { Field } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  service: HubService | null;
  /** 지금 이 workflow가 속한 SIREN project의 code/revision — 후보 검색 기준(Hub 설계서 §19.3). */
  projectCode: string | undefined;
  projectRevision: string | undefined;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

/**
 * 산출물의 external artifact ID는 자유 입력을 받지 않는다 — 연동된 서비스가 code+revision
 * 으로 찾아준 후보 중에서 사람이 직접 골라야만 저장된다(Hub 설계서 §19.3). 오타로 잘못된
 * id가 저장되는 사고를 원천적으로 막기 위한 결정이라, 직접 타이핑으로 우회하는 경로를
 * 두지 않는다(사용자 요청 — RPM 연동 실사용 후 확정).
 *
 * 후보가 하나뿐이어도 자동으로 채우지 않는다 — code+revision이 그 서비스 안에서 항상
 * 유일하다는 보장이 없기 때문이다(RPM처럼). 서비스가 project search를 지원하지
 * 않으면(transport !== 'http' 이거나 baseUrl이 없으면) 애초에 후보를 물어볼 수 없으므로
 * 이 화면에서는 아예 값을 설정할 수 없다 — 그런 서비스를 등록했다면 링크는 여기가 아니라
 * (아직 없는) 다른 수단으로 해야 한다.
 */
export function ExternalArtifactPicker({ service, projectCode, projectRevision, value, onChange, label }: Props) {
  const supportsSearch = !!service && service.transport === 'http' && !!service.baseUrl;

  const { data: candidates, isLoading } = useProjectSearchCandidates(
    service?.key ?? '', projectCode ?? '', projectRevision ?? '', supportsSearch,
  );

  if (!service) return null;

  const fieldLabel = label ?? `External artifact ID — the exact ${service.name} project this deliverable maps to`;

  if (!supportsSearch) {
    return (
      <Field label={fieldLabel}>
        <Box
          sx={{
            fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
            borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6,
          }}
        >
          {service.name} doesn't support picking a project by code/revision, so it can't be linked here.
        </Box>
      </Field>
    );
  }

  const matched = (candidates ?? []).find((c) => c.externalProjectId === value) ?? null;

  return (
    <Field label={fieldLabel}>
      {isLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
          <CircularProgress size={13} /> Searching {service.name}…
        </Box>
      ) : (candidates?.length ?? 0) === 0 ? (
        <Box
          sx={{
            fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
            borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6,
          }}
        >
          No matching {service.name} project for this project's code
          {projectRevision ? `/revision (${projectCode}/${projectRevision})` : ` (${projectCode})`} —
          it may not be registered there yet, or {service.name} may not be reachable right now.
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {candidates!.map((c) => {
            const sel = value === c.externalProjectId;
            return (
              <Box
                key={c.externalProjectId}
                onClick={() => onChange(c.externalProjectId)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: '8px', cursor: CURSOR_POINTER,
                  padding: '8px 10px', borderRadius: '8px',
                  background: sel ? T.tl2 : T.sf,
                  border: `1px solid ${sel ? T.tl3 : T.ln}`,
                  '&:hover': { borderColor: sel ? T.tl3 : T.ln2 },
                }}
              >
                <Box
                  sx={{
                    width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
                    border: `2px solid ${sel ? T.tl : T.ln3}`,
                    background: sel ? T.tl : 'transparent',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{c.displayName}</Box>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>{c.externalProjectId}</Box>
              </Box>
            );
          })}
        </Box>
      )}

      {value && !matched && !isLoading && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.am,
            background: T.am2, border: `1px solid ${T.am3}`, borderRadius: '8px',
            padding: '8px 10px', mt: '8px', lineHeight: 1.6,
          }}
        >
          <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
          Currently set to <Box component="span" sx={{ fontFamily: FONT_MONO }}>{value}</Box>, which isn't
          in the candidates above — pick one to replace it.
        </Box>
      )}
    </Field>
  );
}
