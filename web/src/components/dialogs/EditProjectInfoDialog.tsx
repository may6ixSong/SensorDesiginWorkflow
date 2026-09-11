import { useState } from 'react';
import { Box } from '@mui/material';
import { ProjectDetailDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  project: ProjectDetailDto;
  onClose: () => void;
  onSave: (p: { name: string }) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * 과제 메타데이터(이름) 편집.
 *
 * ★ **code/revision은 생성 후 절대 수정 불가다**(설계서 README §3.1) — Admin이라도 안 된다.
 *   `projects.service.ts#updateProject`가 이 둘이 요청에 실려 오면 무조건 400으로 거부한다.
 *   그래서 여기서도 입력칸이 아니라 **읽기 전용 텍스트**로만 보여주고, 애초에 저장 요청에
 *   실어 보내지 않는다 — 예전엔 입력 가능한 TextInput이었는데, 그러면 안 바꿨어도 항상
 *   code/revision을 같이 보내서 **모든 저장이 400으로 실패**했다(실측 확인된 버그).
 */
export function EditProjectInfoDialog({ project, onClose, onSave, saving, error }: Props) {
  const [name, setName] = useState(project.name);
  const [nameErr, setNameErr] = useState(false);

  const submit = () => {
    const n = name.trim();
    if (!n) { setNameErr(true); return; }
    setNameErr(false);
    onSave({ name: n });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{project.code}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Project Info</Box>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>
      <Field label="Code">
        <Box sx={{ fontSize: 13, color: T.dm, padding: '8px 0' }}>{project.code}</Box>
      </Field>
      <Field label="Revision (EVT)">
        <Box sx={{ fontSize: 13, color: T.dm, padding: '8px 0' }}>{project.revision || '—'}</Box>
      </Field>
      <Box sx={{ fontSize: 11, color: T.dm2, mt: '-9px', mb: '14px', lineHeight: 1.6 }}>
        Code and revision together are this project's identity — they cannot be changed after
        creation, by anyone (design doc README §3.1).
      </Box>
      {error && <Box sx={{ fontSize: 12, color: T.danger, mb: '12px' }}>{error}</Box>}
      <SirenButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="check" /> Save
      </SirenButton>
    </ModalShell>
  );
}
