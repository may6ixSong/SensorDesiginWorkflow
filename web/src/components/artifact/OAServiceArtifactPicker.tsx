import { useArtifactCandidates, useArtifactServices } from '@/api/hooks/useHub';
import { ArtifactIntent } from '@/types/domain';
import { Field, SelectInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import { Box, CircularProgress } from '@mui/material';

interface Props {
  workflowId: string | undefined;
  /** 'live' = OA Service(A), 'hpc' = HPC Service(C) — 이 화면에서는 서비스 목록을 거르는
   * tier 축으로만 쓰이고, 나머지 흐름(후보 조회·pickable 판정)은 완전히 동일하다
   * (설계서 04장 §6.2, §6.3 — HPC Service는 더 이상 "항상 잠김"이 아니다). */
  source: 'live' | 'hpc';
  intent: ArtifactIntent;
  serviceKey: string;
  onServiceChange: (key: string) => void;
  externalArtifactId: string;
  onChange: (id: string) => void;
  onSelectName?: (name: string) => void;
}

const TIER_OF: Record<'live' | 'hpc', 'A' | 'C'> = { live: 'A', hpc: 'C' };

/**
 * "OA Service"/"HPC Service" 소스(Tier A/C) 후보 선택(설계서 04장 §6.3) — 두 단계다.
 *
 * 1. **Service** — Manage Service(Hub 레지스트리, `GET /hub/services`)에 등록된 서비스 중
 *    이 소스의 tier(A 또는 C)이자 Live 연동(transport=http)인 것만.
 * 2. **Artifact** — 그 서비스에 이 workflow가 속한 project의 code+revision을 실시간으로
 *    실어 물어본 후보, pickable까지 서버가 판정해서 내려준다(설계서 04장 §6.3, 07장 §5) —
 *    project를 미리 링크해 두는 단계는 없다. 서비스가 브라우징을 지원하지 않으면
 *    (`supported:false`) 후보 없이 안내만 보여준다.
 */
export function OAServiceArtifactPicker({
  workflowId, source, intent, serviceKey, onServiceChange,
  externalArtifactId, onChange, onSelectName,
}: Props) {
  const { data: allServices, isLoading: loadingServices } = useArtifactServices();
  const services = (allServices ?? []).filter((s) => s.defaultTier === TIER_OF[source] && s.transport === 'http');

  const { data: result, isLoading: loadingCandidates } = useArtifactCandidates(
    workflowId, source, intent, serviceKey, !!serviceKey,
  );

  // service를 바꾸면 이전 artifact 선택은 더 이상 유효하지 않다 — 한 번의 setState로 묶어
  // 같은 이벤트 틱 안에서 부모(ArtifactSourcePicker)의 state가 덮어써지지 않게 한다.
  const chooseService = (key: string) => {
    onServiceChange(key);
  };

  return (
    <>
      <Field label="Service">
        {loadingServices ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading services…
          </Box>
        ) : !services.length ? (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            No {source === 'live' ? 'OA Service' : 'HPC Service'} is registered yet — add one on the Manage Service page first.
          </Box>
        ) : (
          <SelectInput
            value={serviceKey}
            onChange={chooseService}
            options={[{ value: '', label: 'Choose a service…' }, ...services.map((s) => ({ value: s.key, label: s.name }))]}
          />
        )}
      </Field>

      {serviceKey && (
        loadingCandidates ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading artifacts…
          </Box>
        ) : !result?.supported ? (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            {result?.note ?? "This service doesn't support browsing artifacts within a project."}
          </Box>
        ) : (
          <Field label="Artifact">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: 230, overflowY: 'auto' }}>
              {!result.candidates.length && (
                <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
                  No artifacts found in that project.
                </Box>
              )}
              {result.candidates.map((c) => {
                const sel = externalArtifactId === c.externalArtifactId;
                return (
                  <Box
                    key={c.externalArtifactId}
                    onClick={() => { if (c.pickable) { onChange(c.externalArtifactId); onSelectName?.(c.name); } }}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      cursor: c.pickable ? CURSOR_POINTER : 'not-allowed',
                      opacity: c.pickable ? 1 : 0.5,
                      padding: '8px 10px', borderRadius: '8px',
                      background: sel ? T.prSoft : T.sf,
                      border: `1px solid ${sel ? T.prLine : T.ln}`,
                    }}
                  >
                    <Box
                      sx={{
                        width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
                        border: `2px solid ${sel ? T.pr : T.ln3}`,
                        background: sel ? T.pr : 'transparent',
                      }}
                    />
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
              })}
            </Box>
          </Field>
        )
      )}
    </>
  );
}
