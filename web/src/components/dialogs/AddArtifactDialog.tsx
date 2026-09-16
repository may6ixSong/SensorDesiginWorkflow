import { useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { ArtifactSourcePicker, ArtifactSourceState, emptySourceState, resolveNewArtifact } from '@/components/artifact/ArtifactSourcePicker';
import { NewArtifactSourceInput } from '@/api/hooks/useBlocks';
import { ArtifactIntent } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  workflowId: string;
  projectId: string | undefined;
  projectCode: string | undefined;
  projectRevision: string | undefined;
  phases: WorkflowPhase[];
  myDepartments: string[];
  departmentOptions: string[];
  onClose: () => void;
  onCreate: (p: {
    name: string;
    phaseId: string;
    intent: ArtifactIntent;
    newArtifact?: NewArtifactSourceInput;
  }) => void;
  submitting?: boolean;
}

/**
 * "새 Artifact 추가" — 캔버스에 자리(block)를 놓는 동시에 실제 산출물 출처까지 그 자리에서
 * 확정한다(설계서 04장 §6). Tier 글자(A/B/C)는 화면 어디에도 노출하지 않는다.
 *
 * ★ intent(주는/받는)가 첫 질문이다 — 이후 후보 목록의 pickable 판정(edit-only vs
 *   edit-or-view)이 이 값에 따라 갈린다. 생성 후에는 바꾸지 않는다.
 * ★ 소스 선택 UI(ArtifactSourcePicker)는 캔버스에서 만들 때와 이미 만들어진 block의
 *   artifact를 바꿀 때(ChangeArtifactDialog) 둘 다에서 재사용한다.
 */
export function AddArtifactDialog({
  workflowName, workflowId, projectId, phases, myDepartments, departmentOptions,
  onClose, onCreate, submitting,
}: Props) {
  const { t } = useTranslation();
  const [intent, setIntent] = useState<ArtifactIntent>('own');
  const [name, setName] = useState('');
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '');
  const [src, setSrc] = useState<ArtifactSourceState>(emptySourceState());
  const [err, setErr] = useState<string | null>(null);

  const changeIntent = (next: ArtifactIntent) => {
    setIntent(next);
  };

  const submit = () => {
    if (!name.trim() || !phaseId) { setErr('Name and phase are required.'); return; }
    if (!src.source) { setErr('Pick where this artifact comes from.'); return; }
    const newArtifact = resolveNewArtifact(src, name.trim());
    if (!newArtifact) { setErr('Finish picking the artifact for that source.'); return; }
    setErr(null);
    onCreate({ name: name.trim(), phaseId, intent, newArtifact });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={520}
      header={
        <>
          <Ey>{workflowName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Add artifact</Box>
        </>
      }
    >
      <Field label="Is this workflow giving it, or receiving it?">
        <Box sx={{ display: 'flex', gap: '8px' }}>
          {(['own', 'received'] as ArtifactIntent[]).map((v) => (
            <Tooltip
              key={v}
              title={v === 'own' ? t('artifact.intentDeliverableTooltip') : t('artifact.intentPrerequisiteTooltip')}
              placement="top"
              arrow
            >
              <Box
                component="button"
                type="button"
                onClick={() => changeIntent(v)}
                sx={{
                  flex: 1, fontSize: 13, fontWeight: 600, padding: '10px', borderRadius: `${R.sm}px`,
                  cursor: CURSOR_POINTER, transition: '.14s',
                  background: intent === v ? T.prSoft : T.sf,
                  border: `1px solid ${intent === v ? T.pr : T.ln2}`,
                  color: intent === v ? T.pr : T.dm,
                }}
              >
                {v === 'own' ? t('artifact.intentDeliverable') : t('artifact.intentPrerequisite')}
              </Box>
            </Tooltip>
          ))}
        </Box>
      </Field>

      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(null); }}
          autoFocus
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>

      <Field label="Phase — a block sits in exactly one phase">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.id}
              component="button"
              type="button"
              title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
              onClick={() => { setPhaseId(p.id); setErr(null); }}
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                borderRadius: `${R.sm}px`, transition: '.14s', cursor: CURSOR_POINTER,
                background: phaseId === p.id ? T.prSoft : T.sf,
                border: `1px solid ${phaseId === p.id ? T.pr : T.ln2}`,
                color: phaseId === p.id ? T.pr : T.dm,
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.danger }}>
              This workflow has no phases yet — set a schedule before adding artifacts.
            </Box>
          )}
        </Box>
      </Field>

      <ArtifactSourcePicker
        workflowId={workflowId}
        projectId={projectId}
        intent={intent}
        myDepartments={myDepartments}
        departmentOptions={departmentOptions}
        state={src}
        onChange={setSrc}
        onSelectName={(n) => { if (!name.trim()) setName(n); }}
      />

      {err && <Box sx={{ fontSize: 12, color: T.danger, mb: '10px' }}>{err}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={!phases.length || submitting}>
        <Icon name="plus" /> {submitting ? 'Adding…' : 'Add artifact'}
      </SirenButton>
    </ModalShell>
  );
}
