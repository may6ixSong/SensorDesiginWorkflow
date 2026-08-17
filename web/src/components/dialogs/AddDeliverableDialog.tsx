import { useState } from 'react';
import { Box } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton } from '@/components/common/AcroButton';
import { Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  ipName: string;
  phases: PhaseRef[];
  onClose: () => void;
  onCreate: (p: { name: string; phaseKeys: string[]; docType: string; network: 'OA' | 'HPC' }) => void;
}

/**
 * 목업 addDlgH() — 산출물 추가. 같은 산출물이 여러 Phase에 걸쳐 반복 전달되는
 * 경우가 있어(3.6 Release 일정과 동일 개념) Phase를 다중 선택할 수 있다.
 * 첫 선택 Phase에 원본을 만들고, 나머지는 즉시 Release 일정(series)으로 이어붙인다.
 */
export function AddDeliverableDialog({ ipName, phases, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(phases[0] ? [phases[0].key] : []));
  const [net, setNet] = useState<'OA' | 'HPC'>('OA');
  const [type, setType] = useState('word');
  const [err, setErr] = useState(false);

  const togglePick = (k: string) => {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(k)) {
        if (n.size <= 1) return n; // 최소 1개 유지
        n.delete(k);
      } else n.add(k);
      return n;
    });
  };

  const submit = () => {
    if (!name.trim() || !picked.size) { setErr(true); return; }
    // Phase 순서(order) 기준으로 정렬 — 첫 번째가 원본 산출물이 생성되는 Phase가 된다.
    const phaseKeys = phases.filter((p) => picked.has(p.key)).map((p) => p.key);
    onCreate({ name: name.trim(), phaseKeys, docType: net === 'HPC' ? 'path' : type, network: net });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{ipName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Add Deliverable</Box>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(false); }}
          error={err}
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>
      <Field label="Phase(s) — same deliverable may repeat across multiple phases">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.key}
              component="button"
              type="button"
              onClick={() => togglePick(p.key)}
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                background: picked.has(p.key) ? T.tl2 : T.sf,
                border: `1px solid ${picked.has(p.key) ? T.tl : T.ln2}`,
                color: picked.has(p.key) ? T.tl : T.dm,
                '&:hover': { background: picked.has(p.key) ? T.tl2 : T.sf3 },
              }}
            >
              {p.key}
            </Box>
          ))}
        </Box>
      </Field>
      <Row>
        <Field label="Network" sx={{ width: 90 }}>
          <SelectInput
            value={net}
            onChange={(v) => { setNet(v as 'OA' | 'HPC'); if (v === 'HPC') setType('path'); else if (type === 'path') setType('word'); }}
            options={[{ value: 'OA', label: 'OA' }, { value: 'HPC', label: 'HPC' }]}
          />
        </Field>
        <Field label="Format" sx={{ width: 90 }}>
          <SelectInput
            value={type}
            disabled={net === 'HPC'}
            onChange={setType}
            options={[{ value: 'word', label: 'Word' }, { value: 'excel', label: 'Excel' }, { value: 'path', label: 'Path' }]}
          />
        </Field>
      </Row>
      <AcroButton variant="primary" onClick={submit}>
        <Icon name="plus" /> Create
      </AcroButton>
    </ModalShell>
  );
}
