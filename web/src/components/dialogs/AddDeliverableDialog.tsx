import { useState } from 'react';
import { Box } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';

interface Props {
  ipName: string;
  phases: PhaseRef[];
  onClose: () => void;
  onCreate: (p: { name: string; phaseKey: string; docType: string; network: 'OA' | 'HPC' }) => void;
}

/** 목업 addDlgH() — 산출물 추가 */
export function AddDeliverableDialog({ ipName, phases, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [phase, setPhase] = useState(phases[0]?.key ?? '');
  const [net, setNet] = useState<'OA' | 'HPC'>('OA');
  const [type, setType] = useState('word');
  const [err, setErr] = useState(false);

  const submit = () => {
    if (!name.trim()) { setErr(true); return; }
    onCreate({ name: name.trim(), phaseKey: phase, docType: net === 'HPC' ? 'path' : type, network: net });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{ipName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>산출물 추가</Box>
        </>
      }
    >
      <Field label="이름">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(false); }}
          error={err}
          placeholder="예: Startup 시퀀스 검증 결과"
        />
      </Field>
      <Row>
        <Field label="Phase" sx={{ flex: 1 }}>
          <SelectInput
            value={phase}
            onChange={setPhase}
            options={phases.map((p) => ({ value: p.key, label: `${p.key} · ${p.label}` }))}
          />
        </Field>
        <Field label="망" sx={{ width: 90 }}>
          <SelectInput
            value={net}
            onChange={(v) => { setNet(v as 'OA' | 'HPC'); if (v === 'HPC') setType('path'); else if (type === 'path') setType('word'); }}
            options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
          />
        </Field>
        <Field label="형식" sx={{ width: 90 }}>
          <SelectInput
            value={type}
            disabled={net === 'HPC'}
            onChange={setType}
            options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: '경로' }]}
          />
        </Field>
      </Row>
      <AcroButton variant="primary" onClick={submit}>
        <Icon name="plus" /> 만들기
      </AcroButton>
    </ModalShell>
  );
}
