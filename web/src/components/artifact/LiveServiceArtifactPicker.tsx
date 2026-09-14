import { useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useLiveServices, useArtifactCandidates } from '@/api/hooks/useHub';
import { ArtifactIntent } from '@/types/domain';
import { Field, SelectInput, TextInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowId: string | undefined;
  intent: ArtifactIntent;
  serviceKey: string;
  onServiceChange: (key: string) => void;
  externalArtifactId: string;
  onChange: (id: string) => void;
  onSelectName?: (name: string) => void;
}

/**
 * "Live Service" 소스(Tier A) 후보 목록(설계서 04장 §6.3).
 *
 * 이 project에 이미 연결된 서비스만 드롭다운에 나온다 — 연결(project-service-link)은
 * Admin이 별도로 미리 해 둬야 한다. 후보 브라우징을 지원하지 않는 서비스(RPM처럼
 * `GET /artifacts`가 없는 경우)는 `supported:false`로 오고, externalArtifactId를
 * 직접 입력하는 수동 입력으로 폴백한다.
 */
export function LiveServiceArtifactPicker({
  workflowId, intent, serviceKey, onServiceChange, externalArtifactId, onChange, onSelectName,
}: Props) {
  const { data: services, isLoading: loadingServices } = useLiveServices(workflowId);
  const { data: result, isLoading: loadingCandidates } = useArtifactCandidates(
    workflowId, 'live', intent, serviceKey, !!serviceKey,
  );

  // 서비스가 하나뿐이면 미리 골라준다 — 그래도 후보 자동 선택은 하지 않는다.
  useEffect(() => {
    if (!serviceKey && services?.length === 1) onServiceChange(services[0].serviceKey);
  }, [services, serviceKey, onServiceChange]);

  return (
    <>
      <Field label="Service">
        {loadingServices ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading services…
          </Box>
        ) : !services?.length ? (
          <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
            No live service is linked to this project yet — ask an Admin to link one first.
          </Box>
        ) : (
          <SelectInput
            value={serviceKey}
            onChange={(v) => { onServiceChange(v); onChange(''); }}
            options={[{ value: '', label: 'Choose a service…' }, ...services.map((s) => ({ value: s.serviceKey, label: s.name }))]}
          />
        )}
      </Field>

      {serviceKey && (
        loadingCandidates ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
            <CircularProgress size={13} /> Loading artifacts…
          </Box>
        ) : !result?.supported ? (
          <Field label="Artifact ID — this service doesn't support browsing, enter it directly">
            <TextInput value={externalArtifactId} onChange={onChange} placeholder="e.g. PAT-4471" />
            {result?.note && <Box sx={{ fontSize: 11, color: T.dm2, mt: '6px' }}>{result.note}</Box>}
          </Field>
        ) : (
          <Field label="Artifact">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: 230, overflowY: 'auto' }}>
              {!result.candidates.length && (
                <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
                  No artifacts found for this project in that service.
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
