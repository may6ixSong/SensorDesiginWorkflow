import { useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useArtifactCandidates, useArtifactServices, useProjectSearchCandidates } from '@/api/hooks/useHub';
import { ArtifactIntent } from '@/types/domain';
import { Field, SelectInput } from '@/components/common/Panel';
import { Badge } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowId: string | undefined;
  projectCode: string | undefined;
  projectRevision: string | undefined;
  intent: ArtifactIntent;
  serviceKey: string;
  onServiceChange: (key: string) => void;
  externalArtifactId: string;
  onChange: (id: string) => void;
  onSelectName?: (name: string) => void;
}

/**
 * "Live Service" 소스(Tier A) 후보 선택(설계서 04장 §6.3) — 세 단계다.
 *
 * 1. **Service** — Manage Service(Hub 레지스트리, `GET /hub/services`)에 등록된 서비스 중
 *    Live 연동(transport=http)만. 프로젝트에 미리 연결돼 있어야 할 필요는 없다.
 * 2. **Project** — 그 서비스에 이 project의 code+revision으로 검색해서 나온 후보
 *    (`GET /hub/services/:key/projects/search`, §19.3 기존 엔드포인트를 그대로 쓴다).
 *    code+revision이 그 서비스 안에서 유일하다는 보장이 없어(RPM처럼) **항상 사람이
 *    직접 확정한다** — 후보가 하나뿐이어도 자동 선택하지 않는다.
 * 3. **Artifact** — 그 project 안의 산출물 후보, pickable까지 서버가 판정해서 내려준다.
 *    서비스가 브라우징을 지원하지 않으면(`supported:false`) 후보 없이 안내만 보여준다 —
 *    externalArtifactId를 알아낼 방법이 없으니 그 서비스는 지금 이 다이얼로그로는 못 쓴다.
 */
export function LiveServiceArtifactPicker({
  workflowId, projectCode, projectRevision, intent, serviceKey, onServiceChange,
  externalArtifactId, onChange, onSelectName,
}: Props) {
  const [externalProjectId, setExternalProjectId] = useState('');

  const { data: allServices, isLoading: loadingServices } = useArtifactServices();
  const services = (allServices ?? []).filter((s) => s.defaultTier === 'A' && s.transport === 'http');

  const { data: projectCandidates, isLoading: loadingProjects } = useProjectSearchCandidates(
    serviceKey, projectCode ?? '', projectRevision ?? '', !!serviceKey,
  );

  const { data: result, isLoading: loadingCandidates } = useArtifactCandidates(
    workflowId, 'live', intent, serviceKey, !!serviceKey && !!externalProjectId, externalProjectId,
  );

  const chooseService = (key: string) => {
    onServiceChange(key);
    setExternalProjectId('');
    onChange('');
  };
  const chooseProject = (id: string) => {
    setExternalProjectId(id);
    onChange('');
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
            No Live Service is registered yet — add one on the Manage Service page first.
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
        <Field label={`Project — matching this project's code/revision in that service`}>
          {loadingProjects ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', fontSize: 12, color: T.dm2 }}>
              <CircularProgress size={13} /> Searching…
            </Box>
          ) : !projectCandidates?.length ? (
            <Box sx={{ fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`, borderRadius: '8px', padding: '8px 10px', lineHeight: 1.6 }}>
              No matching project found in that service for {projectCode}
              {projectRevision ? ` rev.${projectRevision}` : ''}.
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {projectCandidates.map((c) => {
                const sel = externalProjectId === c.externalProjectId;
                return (
                  <Box
                    key={c.externalProjectId}
                    onClick={() => chooseProject(c.externalProjectId)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: CURSOR_POINTER,
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
                    <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{c.displayName}</Box>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>{c.externalProjectId}</Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Field>
      )}

      {externalProjectId && (
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
