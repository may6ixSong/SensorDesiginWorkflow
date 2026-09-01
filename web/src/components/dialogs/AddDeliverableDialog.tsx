import { useState } from 'react';
import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { ModalShell } from '@/components/common/ModalShell';
import { SirenButton } from '@/components/common/SirenButton';
import { Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  phases: WorkflowPhase[];
  /** 'received'면 헤더 문구가 "내가 받아야 할 산출물"로 바뀐다 — 폼 필드 자체는 동일하다. */
  intent?: 'own' | 'received';
  onClose: () => void;
  onCreate: (p: { name: string; phaseIds: string[]; docType: string; network: 'OA' | 'HPC' }) => void;
}

/**
 * 산출물 추가. 같은 산출물이 여러 phase에 걸쳐 반복 전달되는 경우가 있어(설계서 3.6의
 * Release 일정과 같은 개념) phase를 다중 선택할 수 있다. 첫 선택 phase에 원본을 만들고,
 * 나머지는 즉시 Release 일정(series)으로 이어붙인다.
 *
 * 여기 뜨는 칸은 전부 "이 workflow가 정한 자기 일정"이다 — 과제 마일스톤이 아니다.
 */
export function AddDeliverableDialog({ workflowName, phases, intent = 'own', onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(phases[0] ? [phases[0].id] : []));
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
    // phases는 이미 시작일 오름차순이다 — 그 첫 번째가 원본 산출물이 생성되는 phase다.
    const phaseIds = phases.filter((p) => picked.has(p.id)).map((p) => p.id);
    onCreate({ name: name.trim(), phaseIds, docType: net === 'HPC' ? 'path' : type, network: net });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={460}
      header={
        <>
          <Ey>{workflowName}</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>
            {intent === 'received' ? 'Add Artifact I Need to Receive' : 'Add Deliverable'}
          </Box>
        </>
      }
    >
      {intent === 'received' && (
        <Box
          sx={{
            fontSize: 11.5, color: T.dm, background: T.sf2, border: `1px solid ${T.ln}`,
            borderRadius: '9px', padding: '9px 11px', mb: '12px', lineHeight: 1.7,
          }}
        >
          This creates a placeholder for something you're waiting to receive — someone else will add it
          through a connected service once it's ready, so there's no upload here.
        </Box>
      )}
      <Field label="Name">
        <TextInput
          value={name}
          onChange={(v) => { setName(v); setErr(false); }}
          error={err}
          placeholder="e.g. Startup Sequence Verification Results"
        />
      </Field>
      <Field label="Release schedule — pick every phase this deliverable is due in">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.id}
              component="button"
              type="button"
              title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
              onClick={() => togglePick(p.id)}
              sx={{
                fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: '5px 10px',
                borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                background: picked.has(p.id) ? T.tl2 : T.sf,
                border: `1px solid ${picked.has(p.id) ? T.tl : T.ln2}`,
                color: picked.has(p.id) ? T.tl : T.dm,
                '&:hover': { background: picked.has(p.id) ? T.tl2 : T.sf3 },
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.rd }}>
              This workflow has no phases yet — add a schedule before creating deliverables.
            </Box>
          )}
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
      <SirenButton variant="primary" onClick={submit}>
        <Icon name="plus" /> Create
      </SirenButton>
    </ModalShell>
  );
}
