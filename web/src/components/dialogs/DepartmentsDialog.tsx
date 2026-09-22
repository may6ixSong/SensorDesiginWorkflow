import { useState } from 'react';
import { Box } from '@mui/material';
import { DepartmentDto, ProjectMemberDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { Card, Ey, Field, Row, TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { useAddDepartment, useRemoveDepartment, useRenameDepartment } from '@/api/hooks/useProjects';
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
 * ★ 부서는 이제 `{id, name}`이다(02장 §9.3). **이름은 여기서 바꿀 수 있고, id는 절대 바뀌지
 *   않는다** — workflow/node recipient/Calypso artifact 권한이 전부 그 id를 저장하고 있으므로
 *   이름을 바꿔도 권한은 하나도 끊기지 않고, 그 부서를 보여주는 모든 화면의 라벨만 따라 바뀐다.
 *   그래서 add/rename/remove가 각각 독립 라우트다 — 예전처럼 목록 배열을 통째로 교체하면
 *   서버가 어느 항목이 어느 항목의 후신인지 알 수 없어 id를 새로 발급해 버린다.
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
  departments: DepartmentDto[];
  members: ProjectMemberDto[];
  onClose: () => void;
}) {
  const addDepartment = useAddDepartment(projectId);
  const renameDepartment = useRenameDepartment(projectId);
  const removeDepartment = useRemoveDepartment(projectId);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

  /** 지금 이름을 고치고 있는 부서 — id로 들고 있어야 목록이 재정렬돼도 대상이 흔들리지 않는다. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const memberCountFor = (deptId: string) =>
    members.filter((m) => m.departments.includes(deptId)).length;
  const busy = addDepartment.isPending || renameDepartment.isPending || removeDepartment.isPending;

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (departments.some((d) => norm(d.name) === norm(name))) {
      setErr(`'${name}' is already in the list.`);
      return;
    }
    setErr(null);
    addDepartment.mutate(name, {
      onSuccess: () => { setDraft(''); toast('Department added'); },
      onError: (e) => setErr(errText(e, 'Failed to add department')),
    });
  };

  const commitRename = () => {
    if (!editing) return;
    const name = editing.name.trim();
    const current = departments.find((d) => d.id === editing.id);
    if (!name) return;
    // 이름이 그대로면 요청을 보내지 않는다 — 편집 모드만 닫는다.
    if (current && current.name === name) { setEditing(null); setErr(null); return; }
    if (departments.some((d) => d.id !== editing.id && norm(d.name) === norm(name))) {
      setErr(`'${name}' is already in the list.`);
      return;
    }
    setErr(null);
    renameDepartment.mutate({ deptId: editing.id, name }, {
      onSuccess: () => { setEditing(null); toast('Department renamed'); },
      onError: (e) => setErr(errText(e, 'Failed to rename department')),
    });
  };

  const remove = (dept: DepartmentDto) => {
    if (memberCountFor(dept.id) > 0) return;
    setErr(null);
    removeDepartment.mutate(dept.id, {
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
      {err && <Box sx={{ fontSize: 12, color: T.danger, mb: '10px' }}>{err}</Box>}

      <Card>
        <Ey sx={{ mb: '9px' }}>Departments · {departments.length}</Ey>

        {/* 이름을 바꿔도 권한이 안 끊긴다는 점을 한 줄로 알려 준다 — 사용자가 가장 먼저
            걱정하는 지점이라 버튼을 누르기 전에 보이는 자리에 둔다. */}
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '8px', lineHeight: 1.5 }}>
          Renaming a department keeps every permission and recipient intact — workflows, nodes and
          artifacts reference the department itself, not its name.
        </Box>

        {departments.map((d) => {
          const count = memberCountFor(d.id);
          const canRemove = count === 0;
          const isEditing = editing?.id === d.id;
          return (
            <Box
              key={d.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 0', borderBottom: `1px solid ${T.ln}`,
              }}
            >
              {isEditing ? (
                <>
                  <Box sx={{ flex: 1 }}>
                    <TextInput
                      value={editing.name}
                      onChange={(v) => setEditing({ id: d.id, name: v })}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') { setEditing(null); setErr(null); }
                      }}
                    />
                  </Box>
                  <SirenButton
                    variant="primary"
                    disabled={busy || !editing.name.trim()}
                    onClick={commitRename}
                    title="Save name"
                  >
                    <Icon name="check" />
                  </SirenButton>
                  <SirenButton
                    variant="ghost"
                    disabled={busy}
                    onClick={() => { setEditing(null); setErr(null); }}
                    title="Cancel"
                  >
                    <Icon name="x" />
                  </SirenButton>
                </>
              ) : (
                <>
                  <Box sx={{ flex: 1, fontSize: 13 }}>{d.name}</Box>
                  {count > 0 && (
                    <Box sx={{ fontSize: 10.5, color: T.dm2 }}>
                      {count} member{count > 1 ? 's' : ''}
                    </Box>
                  )}
                  <SirenButton
                    variant="ghost"
                    disabled={busy}
                    onClick={() => { setEditing({ id: d.id, name: d.name }); setErr(null); }}
                    title="Rename department"
                  >
                    <Icon name="edit" />
                  </SirenButton>
                  <SirenButton
                    variant="ghost"
                    disabled={busy || !canRemove}
                    onClick={() => remove(d)}
                    title={canRemove ? 'Remove department' : 'Remove all members from this department first'}
                  >
                    <Icon name="trash" />
                  </SirenButton>
                </>
              )}
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
