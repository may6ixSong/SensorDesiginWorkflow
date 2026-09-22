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
import { NewArtifactSourceInput } from '@/api/hooks/useNodes';
import { ArtifactIntent, DepartmentDto } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, R, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  workflowId: string;
  projectId: string | undefined;
  projectCode: string | undefined;
  projectRevision: string | undefined;
  phases: WorkflowPhase[];
  myDepartments: string[];
  departmentOptions: DepartmentDto[];
  /**
   * 열릴 때 기본으로 체크될 recipient 부서 — list view에서 특정 부서 chip이 활성이면 그
   * 부서다. All이면 빈 배열이라 아무것도 체크되지 않는다(스펙 §6.5).
   *
   * ★ 이건 **UI 기본값일 뿐**이다. 실제로 저장되는 값은 사용자가 Add를 누른 시점의 선택
   *   그대로다 — 기본값을 지우고 다른 부서를 고를 수 있다.
   */
  defaultRecipientDepartments: string[];
  onClose: () => void;
  onCreate: (p: {
    name: string;
    phaseId: string;
    intent: ArtifactIntent;
    newArtifact?: NewArtifactSourceInput;
    recipients: { departments: string[]; users: string[] };
  }) => void;
  submitting?: boolean;
}

/**
 * "새 Artifact 추가" — 캔버스에 자리(node)를 놓는 동시에 실제 산출물 출처까지 그 자리에서
 * 확정한다(설계서 04장 §6). Tier 글자(A/B/C)는 화면 어디에도 노출하지 않는다.
 *
 * ★ intent(주는/받는)가 첫 질문이다 — 이후 후보 목록의 pickable 판정(edit-only vs
 *   edit-or-view)이 이 값에 따라 갈린다. 생성 후에는 바꾸지 않는다.
 * ★ 소스 선택 UI(ArtifactSourcePicker)는 캔버스에서 만들 때와 이미 만들어진 node의
 *   artifact를 바꿀 때(ChangeArtifactDialog) 둘 다에서 재사용한다.
 */
export function AddArtifactDialog({
  workflowName, workflowId, projectId, phases, myDepartments, departmentOptions,
  defaultRecipientDepartments, onClose, onCreate, submitting,
}: Props) {
  const { t } = useTranslation();
  const [intent, setIntent] = useState<ArtifactIntent>('own');
  const [name, setName] = useState('');
  /** 사용자가 마지막으로 고른 artifact 후보의 이름 — name 필드를 비워 둔 채 제출해도
   * 이 값으로 채워 보낸다(사용자 요청: artifact를 매핑하면 이름은 optional). */
  const [pickedName, setPickedName] = useState('');
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '');
  /** true면 이 자리에서 바로 artifact를 매핑하고, false면 자리만 잡아두고 나중에
   * 매핑한다(사용자 요청 — node는 artifact 없이도 만들 수 있다, 설계서 03장 §2.3). */
  const [mapNow, setMapNow] = useState(true);
  const [src, setSrc] = useState<ArtifactSourceState>(emptySourceState());
  const [err, setErr] = useState<string | null>(null);
  /** 기본값으로 시작하되 사용자가 자유롭게 바꾼다. users는 이 화면에서 다루지 않는다 —
   *  생성 후 node 상세의 Recipients 탭에서 지정한다(스펙 §6.5). */
  const [recipientDepts, setRecipientDepts] = useState<string[]>(defaultRecipientDepartments);

  const changeIntent = (next: ArtifactIntent) => {
    setIntent(next);
  };

  const submit = () => {
    if (!phaseId) { setErr('Phase is required.'); return; }
    if (!mapNow) {
      // 매핑을 나중으로 미루는 경우엔 이름이 유일한 단서라 반드시 있어야 한다.
      if (!name.trim()) { setErr('Name is required when you are not mapping an artifact yet.'); return; }
      setErr(null);
      onCreate({ name: name.trim(), phaseId, intent, recipients: { departments: recipientDepts, users: [] } });
      return;
    }
    if (!src.source) { setErr('Pick where this artifact comes from.'); return; }
    const finalName = name.trim() || pickedName;
    if (!finalName) { setErr('Name and phase are required.'); return; }
    const newArtifact = resolveNewArtifact(src, finalName);
    if (!newArtifact) { setErr('Finish picking the artifact for that source.'); return; }
    setErr(null);
    onCreate({ name: finalName, phaseId, intent, newArtifact, recipients: { departments: recipientDepts, users: [] } });
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

      <Field label={mapNow ? 'Name — optional, defaults to the artifact you pick below' : 'Name'}>
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(null); }}
          autoFocus
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>

      <Field label="Phase — a node sits in exactly one phase">
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

      <Field label="Artifact mapping">
        <Box sx={{ display: 'flex', gap: '8px' }}>
          {([true, false] as const).map((v) => (
            <Box
              key={String(v)}
              component="button"
              type="button"
              onClick={() => { setMapNow(v); setErr(null); }}
              sx={{
                flex: 1, fontSize: 13, fontWeight: 600, padding: '10px', borderRadius: `${R.sm}px`,
                cursor: CURSOR_POINTER, transition: '.14s',
                background: mapNow === v ? T.prSoft : T.sf,
                border: `1px solid ${mapNow === v ? T.pr : T.ln2}`,
                color: mapNow === v ? T.pr : T.dm,
              }}
            >
              {v ? 'Map an artifact now' : 'Decide later'}
            </Box>
          ))}
        </Box>
      </Field>

      <Field label={t('node.recipients')}>
        {departmentOptions.length === 0 ? (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>This project has no departments registered yet.</Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {departmentOptions.map((d) => {
                const on = recipientDepts.includes(d.id);
                return (
                  <Box
                    key={d.id}
                    component="button"
                    type="button"
                    onClick={() =>
                      setRecipientDepts((prev) =>
                        prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                      )
                    }
                    sx={{
                      fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: `${R.pill}px`,
                      cursor: CURSOR_POINTER, transition: '.14s', fontFamily: 'inherit',
                      background: on ? T.prSoft : T.sf,
                      color: on ? T.pr : T.dm,
                      border: `1px solid ${on ? T.pr : T.ln2}`,
                    }}
                  >
                    {on ? '✓ ' : ''}{d.name}
                  </Box>
                );
              })}
            </Box>
            {recipientDepts.length === 0 && (
              <Box sx={{ fontSize: 11, color: T.warn, mt: '6px' }}>{t('node.recipientsEmptyHint')}</Box>
            )}
          </>
        )}
      </Field>

      {mapNow ? (
        <ArtifactSourcePicker
          workflowId={workflowId}
          projectId={projectId}
          intent={intent}
          myDepartments={myDepartments}
          departmentOptions={departmentOptions}
          state={src}
          onChange={setSrc}
          onSelectName={(n) => { setPickedName(n); if (!name.trim()) setName(n); }}
        />
      ) : (
        <Box sx={{ fontSize: 11.5, color: T.dm2, lineHeight: 1.6, mb: '10px' }}>
          This just holds a place on the canvas — map it to an artifact later from the node&apos;s detail.
        </Box>
      )}

      {err && <Box sx={{ fontSize: 12, color: T.danger, mb: '10px' }}>{err}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={!phases.length || submitting}>
        <Icon name="plus" /> {submitting ? 'Adding…' : 'Add artifact'}
      </SirenButton>
    </ModalShell>
  );
}
