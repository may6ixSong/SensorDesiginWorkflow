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
  onSave: (p: { name: string; code: string; revision: string }) => void;
  saving?: boolean;
  error?: string | null;
}

/**
 * 과제 메타데이터(이름/code/revision) 편집 — 지금까지 이 화면 자체가 없어서
 * `PATCH /projects/:id`가 아무 화면에서도 호출되지 않았다. revision(RPM 쪽 EVT에 대응,
 * Hub 설계서 §19.3)을 채울 수 있는 유일한 자리이기도 하다.
 *
 * code+revision 조합에만 유니크 제약이 걸려 있다 — 같은 code라도 revision이 다르면
 * 별개 프로젝트로 취급된다. status는 이 화면에서 다루지 않는다.
 */
export function EditProjectInfoDialog({ project, onClose, onSave, saving, error }: Props) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [revision, setRevision] = useState(project.revision ?? '');
  const [nameErr, setNameErr] = useState(false);
  const [codeErr, setCodeErr] = useState(false);

  const submit = () => {
    const n = name.trim();
    const c = code.trim();
    if (!n) { setNameErr(true); return; }
    if (!c) { setCodeErr(true); return; }
    setNameErr(false);
    setCodeErr(false);
    onSave({ name: n, code: c, revision: revision.trim() });
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
        <TextInput value={code} onChange={(v) => { setCode(v); setCodeErr(false); }} error={codeErr} />
      </Field>
      <Field label="Revision (EVT) — e.g. EVT0. Leave blank if this project doesn't use one.">
        <TextInput value={revision} onChange={setRevision} placeholder="EVT0" />
      </Field>
      <Box sx={{ fontSize: 11, color: T.dm2, mt: '-9px', mb: '14px', lineHeight: 1.6 }}>
        Code + revision together must be unique — changing either can collide with another
        project that already uses that exact combination.
      </Box>
      {error && <Box sx={{ fontSize: 12, color: T.rd, mb: '12px' }}>{error}</Box>}
      <SirenButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="check" /> Save
      </SirenButton>
    </ModalShell>
  );
}
