import { useState } from 'react';
import { Box } from '@mui/material';
import { ProjectDetailDto } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { T } from '@/theme/tokens';

interface Props {
  project: ProjectDetailDto;
  onClose: () => void;
  onSave: (p: { name: string; code: string; domain: string; status: string }) => void;
  saving?: boolean;
  error?: string | null;
}

/** Project Information 페이지의 "Edit" 버튼 — 메타데이터(이름/코드/도메인/상태)만 수정한다. Phase는 읽기 전용. */
export function EditProjectDialog({ project, onClose, onSave, saving, error }: Props) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [domain, setDomain] = useState(project.domain);
  const [status, setStatus] = useState(project.status);
  const [nameErr, setNameErr] = useState(false);
  const [codeErr, setCodeErr] = useState(false);

  const submit = () => {
    const n = name.trim();
    const c = code.trim();
    if (!n) { setNameErr(true); return; }
    if (!c) { setCodeErr(true); return; }
    onSave({ name: n, code: c, domain: domain.trim() || project.domain, status });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{project.code}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Program</Box>
        </>
      }
    >
      <Field label="Name">
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>
      <Row>
        <Field label="Code" sx={{ flex: 1 }}>
          <TextInput value={code} onChange={(v) => { setCode(v); setCodeErr(false); }} error={codeErr} />
        </Field>
        <Field label="Domain" sx={{ flex: 1 }}>
          <TextInput value={domain} onChange={setDomain} />
        </Field>
      </Row>
      <Field label="Status">
        <SelectInput
          value={status}
          onChange={setStatus}
          options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }]}
        />
      </Field>
      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mb: '10px' }}>{error}</Box>}
      <AcroButton variant="primary" onClick={submit} disabled={saving}>
        <Icon name="check" /> {saving ? 'Saving…' : 'Save'}
      </AcroButton>
    </ModalShell>
  );
}
