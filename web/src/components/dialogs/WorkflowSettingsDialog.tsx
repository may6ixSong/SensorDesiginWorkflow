import { useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Milestone, WorkflowDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, T } from '@/theme/tokens';
import { ScheduleDraft } from './ScheduleEditor';
import { WorkflowPhasesPanel } from './WorkflowPhasesPanel';
import { WorkflowPermissionPanel } from './WorkflowPermissionPanel';

export type WorkflowSettingsTab = 'details' | 'schedule' | 'permissions';

interface Props {
  workflow: WorkflowDto;
  /** Edit 권한자 — Details/Schedule 탭은 이 사람에게만 뜬다. Permissions는 view 권한자도 볼 수 있다. */
  own: boolean;
  initialTab: WorkflowSettingsTab;
  milestones: Milestone[];
  orphanCount: number;
  onClose: () => void;

  onSaveDetails: (p: { name: string; description: string }) => void;
  savingDetails?: boolean;
  detailsError?: string | null;

  onSavePhases: (phases: ScheduleDraft[]) => void;
  savingPhases?: boolean;
  phasesError?: string | null;

  onAddOwner: (knoxId: string, department: string) => void;
  onRemoveOwner: (knoxId: string) => void;
  onAddViewGrant: (knoxId: string, department: string) => void;
  onRemoveViewGrant: (knoxId: string) => void;
}

/**
 * Workflow 하나의 설정 — Details(이름/설명) / Schedule(일정) / Permissions(담당자·권한)를
 * 탭으로 묶은 단일 진입점. 예전에는 헤더에 "Edit phases"·"Owners & permissions" 아이콘
 * 버튼이 따로 있었지만(사용자 요청으로 통합), 여기서는 workflow명 옆 연필 버튼 하나로
 * 들어와 탭으로 갈아탄다.
 *
 * Details/Schedule은 Edit 권한자만 고칠 수 있으므로 그 탭 자체를 own일 때만 보여준다 —
 * Permissions는 view 권한자도 현재 담당자를 볼 수 있어야 하므로 항상 보인다
 * (WorkflowPermissionPanel이 own이 아니면 내부적으로 읽기 전용으로 그린다).
 */
export function WorkflowSettingsDialog({
  workflow, own, initialTab, milestones, orphanCount, onClose,
  onSaveDetails, savingDetails, detailsError,
  onSavePhases, savingPhases, phasesError,
  onAddOwner, onRemoveOwner, onAddViewGrant, onRemoveViewGrant,
}: Props) {
  const { t } = useTranslation();
  const tabs: { key: WorkflowSettingsTab; label: string }[] = [
    ...(own ? [{ key: 'details' as const, label: t('workflow.tabDetails') }] : []),
    ...(own ? [{ key: 'schedule' as const, label: t('workflow.tabSchedule') }] : []),
    { key: 'permissions', label: t('workflow.tabPermissions') },
  ];
  const [tab, setTab] = useState<WorkflowSettingsTab>(
    tabs.some((x) => x.key === initialTab) ? initialTab : tabs[0].key,
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      width={680}
      header={
        <>
          <Ey>{t('workflow.settings')}</Ey>
          <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>{workflow.name}</Box>
        </>
      }
      belowHeader={
        <Box sx={{ display: 'flex', gap: '2px', mt: '11px', borderBottom: `1px solid ${T.ln}` }}>
          {tabs.map(({ key, label }) => (
            <Box
              key={key}
              component="button"
              onClick={() => setTab(key)}
              sx={{
                padding: '8px 13px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                color: tab === key ? T.tl : T.dm, background: 'none', border: 'none',
                borderBottom: `2px solid ${tab === key ? T.tl : 'transparent'}`,
                mb: '-1px', cursor: CURSOR_POINTER,
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      }
    >
      {tab === 'details' && (
        <DetailsTab workflow={workflow} onSave={onSaveDetails} saving={savingDetails} error={detailsError} />
      )}
      {tab === 'schedule' && (
        <WorkflowPhasesPanel
          phases={workflow.phases}
          milestones={milestones}
          orphanCount={orphanCount}
          onSave={onSavePhases}
          saving={savingPhases}
          error={phasesError}
        />
      )}
      {tab === 'permissions' && (
        <WorkflowPermissionPanel
          workflow={workflow}
          own={own}
          onAddOwner={onAddOwner}
          onRemoveOwner={onRemoveOwner}
          onAddViewGrant={onAddViewGrant}
          onRemoveViewGrant={onRemoveViewGrant}
        />
      )}
    </ModalShell>
  );
}

function DetailsTab({
  workflow, onSave, saving, error,
}: {
  workflow: WorkflowDto; onSave: Props['onSaveDetails']; saving?: boolean; error?: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [nameErr, setNameErr] = useState(false);

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <>
      <Field label={t('workflow.nameLabel')}>
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>
      <Field label={t('workflow.descriptionLabel')}>
        <TextInput value={description} onChange={setDescription} placeholder="One line about what this workflow covers" />
      </Field>

      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mb: '10px' }}>{error}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="check" /> {saving ? 'Saving…' : t('workflow.saveDetails')}
      </SirenButton>
    </>
  );
}
