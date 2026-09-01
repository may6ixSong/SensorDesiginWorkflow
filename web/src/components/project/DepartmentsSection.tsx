import { useState } from 'react';
import { Box } from '@mui/material';
import { Card, Ey, Field, Row, TextInput } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/store/toastStore';
import { useUpdateProjectDepartments } from '@/api/hooks/useProjects';
import { T } from '@/theme/tokens';

const norm = (v: string) => v.trim().toUpperCase();
const errText = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

/**
 * 이 과제가 산출물 "Received from" 화면에서 후보로 보여줄 부서 목록을 관리한다.
 *
 * 전사 고정 DEPARTMENTS(6종, common/constants/departments.ts)와는 별개 축이다 — 그건
 * recvDept(전달 부서) 검증에 계속 쓰이는 값이고, 이 목록은 산출물을 "누구에게서 받는지"
 * 표시할 때 쓰는 라벨 후보라 과제마다 자유롭게 늘리거나 줄일 수 있다. 새 과제는 항상
 * 그 6개로 시작하지만(BE의 기본값), 이후로는 이 화면에서 완전히 독립적으로 관리한다 —
 * 설계 도메인이 아닌 부서는 이 시스템 자체를 안 쓸 수도 있어 전사 고정값으로 묶어두지 않는다.
 */
export function DepartmentsSection({
  projectId, departments, own,
}: {
  projectId: string; departments: string[]; own: boolean;
}) {
  const updateDepartments = useUpdateProjectDepartments(projectId);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

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
    setErr(null);
    updateDepartments.mutate(departments.filter((d) => norm(d) !== norm(dept)), {
      onSuccess: () => toast('Department removed'),
      onError: (e) => setErr(errText(e, 'Failed to remove department')),
    });
  };

  const busy = updateDepartments.isPending;

  return (
    <Box sx={{ mt: '26px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
        <Box sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>
          Departments
          <Box component="span" sx={{ fontWeight: 400, color: T.dm2, ml: '7px', fontSize: 13 }}>
            candidates for "Received from" on artifacts this project's workflows need — add or
            remove freely, e.g. for departments that don't use this system yet
          </Box>
        </Box>
      </Box>

      {err && <Box sx={{ fontSize: 12, color: T.rd, mb: '10px' }}>{err}</Box>}

      <Card sx={{ maxWidth: 460 }}>
        <Ey sx={{ mb: '9px' }}>Departments · {departments.length}</Ey>

        {departments.map((d) => (
          <Box
            key={d}
            sx={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 0', borderBottom: `1px solid ${T.ln}`,
            }}
          >
            <Box sx={{ flex: 1, fontSize: 13 }}>{d}</Box>
            {own && (
              <SirenButton variant="ghost" disabled={busy} onClick={() => remove(d)} title="Remove department">
                <Icon name="trash" />
              </SirenButton>
            )}
          </Box>
        ))}

        {departments.length === 0 && (
          <Box sx={{ fontSize: 12, color: T.dm2, padding: '7px 0' }}>
            No departments yet — artifacts can still be marked as received, just without a picked label.
          </Box>
        )}

        {own && (
          <Row sx={{ mt: '11px', alignItems: 'flex-end' }}>
            <Field label="Add department" sx={{ mb: 0, flex: 1 }}>
              <TextInput value={draft} onChange={setDraft} placeholder="e.g. Packaging" />
            </Field>
            <SirenButton disabled={busy || !draft.trim()} onClick={add}>
              <Icon name="plus" /> Add
            </SirenButton>
          </Row>
        )}
      </Card>
    </Box>
  );
}
