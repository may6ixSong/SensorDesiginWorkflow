import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AccessGrant, Milestone, WorkflowDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, SelectInput, TextInput } from '@/components/common/Panel';
import { TabPanel, Tabs } from '@/components/common/Tabs';
import { Icon } from '@/components/common/Icon';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { R, T } from '@/theme/tokens';
import { ScheduleDraft } from './ScheduleEditor';
import { WorkflowPhasesPanel } from './WorkflowPhasesPanel';
import { WorkflowPermissionPanel } from './WorkflowPermissionPanel';

export type WorkflowSettingsTab = 'details' | 'schedule' | 'permissions';

interface Props {
  workflow: WorkflowDto;
  /** Edit 권한자 — View 권한자에게는 이 dialog로 들어오는 버튼 자체가 없다. */
  own: boolean;
  initialTab: WorkflowSettingsTab;
  milestones: Milestone[];
  orphanCount: number;
  onClose: () => void;

  /**
   * Name / Description / Department를 **한 번에** 저장한다(설계서 02장 §7.2).
   * 화면의 Save 버튼이 하나이므로 API도 하나다.
   */
  onSave: (p: { name: string; description: string; department: string }) => void;
  saving?: boolean;
  saveError?: string | null;

  /** 부서 후보 — 내가 이 과제에서 속한 부서(Admin이면 과제 전체). */
  myDepartments: string[];
  /** 권한 편집용 부서 후보 — 그 과제에 등록된 부서 전체. */
  departmentOptions: string[];

  onSavePhases: (phases: ScheduleDraft[]) => void;
  savingPhases?: boolean;
  phasesError?: string | null;

  onSaveAccess: (p: { editAccess: AccessGrant; viewAccess: AccessGrant }) => void;
  savingAccess?: boolean;
}

/**
 * Workflow 하나의 설정 — Details / Schedule / Permissions를 탭으로 묶은 단일 진입점.
 *
 * ★ View 권한자에게는 이 dialog를 여는 버튼 자체가 없다(설계서 01장 §3.8). 그래서 예전처럼
 *   "Permissions 탭만 읽기 전용으로 열어 두는" 분기가 사라졌다.
 */
export function WorkflowSettingsDialog({
  workflow, own, initialTab, milestones, orphanCount, onClose,
  onSave, saving, saveError,
  myDepartments, departmentOptions,
  onSavePhases, savingPhases, phasesError,
  onSaveAccess, savingAccess,
}: Props) {
  const { t } = useTranslation();
  const tabs: { key: WorkflowSettingsTab; label: string }[] = [
    { key: 'details', label: t('workflow.tabDetails') },
    { key: 'schedule', label: t('workflow.tabSchedule') },
    { key: 'permissions', label: t('workflow.tabPermissions') },
  ];
  const [tab, setTab] = useState<WorkflowSettingsTab>(
    tabs.some((x) => x.key === initialTab) ? initialTab : 'details',
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
      belowHeader={<Tabs tabs={tabs} value={tab} onChange={setTab} sx={{ mt: '11px' }} />}
    >
      <TabPanel tabKey={tab}>
        {tab === 'details' && (
          <DetailsTab
            workflow={workflow}
            myDepartments={myDepartments}
            onSave={onSave}
            saving={saving}
            error={saveError}
          />
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
          <PermissionsTab
            workflow={workflow}
            own={own}
            departmentOptions={departmentOptions}
            onSaveAccess={onSaveAccess}
            saving={savingAccess}
          />
        )}
      </TabPanel>
    </ModalShell>
  );
}

/**
 * Name → Description → Department 순으로 세우고 그 아래 Save 하나를 둔다
 * (설계서 README §3.2).
 *
 * ★ Save를 누르면 **항상 confirm**을 거친다.
 * ★ Department가 바뀐 경우에만 confirm 안에 **주황색 경고**를 덧붙인다 — 부서 변경은
 *   editAccess 교체를 동반해 사실상 권한 이양이기 때문이다(설계서 01장 §3.5).
 */
function DetailsTab({
  workflow, myDepartments, onSave, saving, error,
}: {
  workflow: WorkflowDto;
  myDepartments: string[];
  onSave: Props['onSave'];
  saving?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [department, setDepartment] = useState(workflow.department);
  const [nameErr, setNameErr] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const departmentChanged = department !== workflow.department;

  /**
   * 지금 배정된 부서가 내 부서 목록에 없을 수 있다(다른 사람이 만들었거나, 내가 부서를
   * 옮겼거나). 그 값을 셀렉트에서 지워버리면 화면이 거짓말을 하게 되므로, 선택된 채로
   * 비활성 항목으로 목록 맨 위에 끼워 보여준다(설계서 01장 §3.5).
   */
  const options = useMemo(() => {
    const current = (workflow.department ?? '').trim();
    const mine = myDepartments.map((d) => ({ value: d, label: d }));
    if (current && !myDepartments.includes(current)) {
      return [{ value: current, label: current, disabled: true }, ...mine];
    }
    return mine;
  }, [workflow.department, myDepartments]);

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    setConfirmOpen(true);
  };

  return (
    <>
      <Field label={t('workflow.nameLabel')}>
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>

      <Field label={t('workflow.descriptionLabel')}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder="One line about what this workflow covers"
        />
      </Field>

      <Field label={t('workflow.departmentLabel')}>
        <SelectInput value={department} onChange={setDepartment} options={options} />
        {/* dropdown 바로 아래에 이 값이 무엇을 뜻하는지 한 줄로 알려 준다. */}
        <Box sx={{ fontSize: 11.5, color: T.dm2, mt: '6px' }}>{t('workflow.departmentHint')}</Box>
      </Field>

      {error && <Box sx={{ fontSize: 11.5, color: T.danger, mb: '10px' }}>{error}</Box>}

      <SirenButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="check" /> {saving ? 'Saving…' : t('workflow.save')}
      </SirenButton>

      {confirmOpen && (
        <ConfirmDialog
          title={t('workflow.saveConfirmTitle')}
          message={t('workflow.saveConfirmMessage')}
          confirmLabel={t('workflow.save')}
          danger={false}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onSave({ name: name.trim(), description: description.trim(), department });
          }}
        >
          {departmentChanged && (
            <Box
              sx={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                background: T.warnSoft, border: `1px solid ${T.warnLine}`,
                color: T.warn, borderRadius: `${R.sm}px`,
                padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, mt: '12px',
              }}
            >
              <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="warn" /></Box>
              <Box>
                <Box sx={{ fontWeight: 700, mb: '2px' }}>
                  {workflow.department} → {department}
                </Box>
                {t('workflow.departmentChangeWarning')}
              </Box>
            </Box>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/**
 * 권한 탭 — 편집기에서 바뀐 값을 로컬 상태로 들고 있다가 Save 한 번에 통째로 교체한다
 * (`PUT /workflows/:id/access`).
 */
function PermissionsTab({
  workflow, own, departmentOptions, onSaveAccess, saving,
}: {
  workflow: WorkflowDto;
  own: boolean;
  departmentOptions: string[];
  onSaveAccess: Props['onSaveAccess'];
  saving?: boolean;
}) {
  const { t } = useTranslation();
  const [editAccess, setEditAccess] = useState<AccessGrant>(
    workflow.editAccess ?? { departments: [], users: [] },
  );
  const [viewAccess, setViewAccess] = useState<AccessGrant>(
    workflow.viewAccess ?? { departments: [], users: [] },
  );

  const dirty =
    JSON.stringify(editAccess) !== JSON.stringify(workflow.editAccess ?? { departments: [], users: [] }) ||
    JSON.stringify(viewAccess) !== JSON.stringify(workflow.viewAccess ?? { departments: [], users: [] });

  return (
    <>
      <WorkflowPermissionPanel
        workflow={workflow}
        own={own}
        departmentOptions={departmentOptions}
        editAccess={editAccess}
        viewAccess={viewAccess}
        onChangeEdit={setEditAccess}
        onChangeView={setViewAccess}
      />

      {own && (
        <Box sx={{ mt: '14px' }}>
          <SirenButton
            variant="primary"
            onClick={() => onSaveAccess({ editAccess, viewAccess })}
            disabled={saving || !dirty}
          >
            <Icon name="check" /> {saving ? 'Saving…' : t('workflow.save')}
          </SirenButton>
        </Box>
      )}
    </>
  );
}
