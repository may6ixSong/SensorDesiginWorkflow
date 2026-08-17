import { useState } from 'react';
import { Box } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { ModalShell } from '@/components/common/ModalShell';
import { AcroButton } from '@/components/common/AcroButton';
import { DateInput, Ey, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  phases: PhaseRef[];
  onClose: () => void;
  onSave: (phases: { key: string; label: string; start: string; end: string }[]) => void;
  saving?: boolean;
  error?: string | null;
}

type Row = { key: string; order: number; label: string; start: string; end: string };

/** Project Information의 "Edit schedule" — 마일스톤 label/start/end만 수정한다(key/order 고정). */
export function EditMilestonesDialog({ phases, onClose, onSave, saving, error }: Props) {
  const [rows, setRows] = useState<Row[]>(
    () => [...phases].sort((a, b) => a.order - b.order).map((p) => ({ key: p.key, order: p.order, label: p.label, start: p.start, end: p.end })),
  );
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const setField = (key: string, field: 'label' | 'start' | 'end', value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setRowErr((prev) => ({ ...prev, [key]: '' }));
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    rows.forEach((r) => {
      if (!r.label.trim()) errs[r.key] = 'Label is required.';
      else if (!r.start || !r.end) errs[r.key] = 'Start and end dates are required.';
      else if (new Date(r.start).getTime() >= new Date(r.end).getTime()) errs[r.key] = 'Start must be before end.';
    });
    setRowErr(errs);
    if (Object.keys(errs).length) return;
    onSave(rows.map((r) => ({ key: r.key, label: r.label.trim(), start: r.start, end: r.end })));
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      width={620}
      header={
        <>
          <Ey>Milestones</Ey>
          <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>Edit Schedule</Box>
        </>
      }
    >
      <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '14px' }}>
        Milestone names and dates can be adjusted. Milestones can't be added or removed here.
      </Box>
      {rows.map((r) => (
        <Box
          key={r.key}
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0',
            borderBottom: `1px solid ${T.ln}`,
          }}
        >
          <Box
            sx={{
              flex: '0 0 44px', fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700,
              color: T.dm, padding: '9px 0',
            }}
          >
            {r.key}
          </Box>
          <Box sx={{ flex: '1 1 180px', minWidth: 140 }}>
            <TextInput value={r.label} onChange={(v) => setField(r.key, 'label', v)} error={!!rowErr[r.key]} />
          </Box>
          <Box sx={{ flex: '0 0 148px' }}>
            <DateInput value={r.start} onChange={(v) => setField(r.key, 'start', v)} error={!!rowErr[r.key]} />
          </Box>
          <Box component="span" sx={{ padding: '9px 0', color: T.dm2 }}>→</Box>
          <Box sx={{ flex: '0 0 148px' }}>
            <DateInput value={r.end} onChange={(v) => setField(r.key, 'end', v)} error={!!rowErr[r.key]} />
          </Box>
        </Box>
      ))}
      {Object.values(rowErr).some(Boolean) && (
        <Box sx={{ fontSize: 11.5, color: T.rd, mt: '10px' }}>
          {Object.entries(rowErr).find(([, v]) => v)?.[1]}
        </Box>
      )}
      {error && <Box sx={{ fontSize: 11.5, color: T.rd, mt: '10px' }}>{error}</Box>}
      <AcroButton variant="primary" onClick={submit} disabled={saving} sx={{ mt: '16px' }}>
        <Icon name="check" /> {saving ? 'Saving…' : 'Save'}
      </AcroButton>
    </ModalShell>
  );
}
