import { useState } from 'react';
import { Box } from '@mui/material';
import { ProjectMemberDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { Card, Ey, Field, Row, TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { useUpdateProjectDepartments } from '@/api/hooks/useProjects';
import { T } from '@/theme/tokens';

const norm = (v: string) => v.trim().toUpperCase();
const errText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/**
 * "Team Members" 옆 "Manage departments" 버튼에서 여는 다이얼로그 — 이 과제가 산출물
 * "Received from" 화면에서 후보로 보여줄 부서 목록을 관리한다.
 *
 * 전사 고정 DEPARTMENTS(6종, common/constants/departments.ts)와는 별개 축이다 — 그건
 * recvDept(전달 부서) 검증에 계속 쓰이는 값이고, 이 목록은 산출물을 "누구에게서 받는지"
 * 표시할 때 쓰는 라벨 후보라 과제마다 자유롭게 늘리거나 줄일 수 있다.
 *
 * 부서 삭제는 그 부서에 소속된 멤버가 한 명도 없을 때만 허용한다 — 멤버가 있는 부서를
 * 지우면 그 멤버의 소속 정보가 조용히 사라지므로, 삭제 버튼 자체를 비활성화해 먼저
 * 멤버를 다 빼도록 유도한다. 각 변경은 즉시 project 쿼리 캐시에 반영되므로, 다이얼로그를
 * 닫고 나면 Team Members 목록에도 최신 부서가 보인다.
 */
export function DepartmentsDialog({
  projectId, departments, members, onClose,
}: {
  projectId: string;
  departments: string[];
  members: ProjectMemberDto[];
  onClose: () => void;
}) {
  const updateDepartments = useUpdateProjectDepartments(projectId);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const memberCountFor = (dept: string) => members.filter((m) => m.departments.includes(dept)).length;
  const busy = updateDepartments.isPending;

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (departments.some((d) => norm(d) === norm(name))) {
      setErr(`'${name}' is already in the list.`);
      return;
    }
    setErr(null);
    updateDepartments.mutate([...departments, name], {
      onSuccess: () => { setDraft(''); toast('Department added'); },
      onError: (e) => setErr(errText(e, 'Failed to add department')),
    });
  };

  const remove = (dept: string) => {
    if (memberCountFor(dept) > 0) return;
    setErr(null);
    updateDepartments.mutate(departments.filter((d) => norm(d) !== norm(dept)), {
      onSuccess: () => toast('Department removed'),
      onError: (e) => setErr(errText(e, 'Failed to remove department')),
    });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={480}
      header={
        <>
          <Ey>Team Members</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Manage Departments</Box>
        </>
      }
    >
      {err && <Box sx={{ fontSize: 12, color: T.rd, mb: '10px' }}>{err}</Box>}

      <Card>
        <Ey sx={{ mb: '9px' }}>Departments · {departments.length}</Ey>

        {departments.map((d) => {
          const count = memberCountFor(d);
          const canRemove = count === 0;
          return (
            <Box
              key={d}
              sx={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 0', borderBottom: `1px solid ${T.ln}`,
              }}
            >
              <Box sx={{ flex: 1, fontSize: 13 }}>{d}</Box>
              {count > 0 && (
                <Box sx={{ fontSize: 10.5, color: T.dm2 }}>
                  {count} member{count > 1 ? 's' : ''}
                </Box>
              )}
              <SirenButton
                variant="ghost"
                disabled={busy || !canRemove}
                onClick={() => remove(d)}
                title={canRemove ? 'Remove department' : 'Remove all members from this department first'}
              >
                <Icon name="trash" />
              </SirenButton>
            </Box>
          );
        })}

        {departments.length === 0 && (
          <Box sx={{ fontSize: 12, color: T.dm2, padding: '7px 0' }}>
            No departments yet.
          </Box>
        )}

        <Row sx={{ mt: '11px', alignItems: 'flex-end' }}>
          <Field label="Add department" sx={{ mb: 0, flex: 1 }}>
            <TextInput
              value={draft}
              onChange={setDraft}
              placeholder="e.g. Packaging"
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
          </Field>
          <SirenButton disabled={busy || !draft.trim()} onClick={add}>
            <Icon name="plus" /> Add
          </SirenButton>
        </Row>
      </Card>
    </ModalShell>
  );
}
