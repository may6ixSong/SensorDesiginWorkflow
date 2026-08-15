import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, TextField } from '@mui/material';
import { useCreateDeliverable } from '@/api/hooks/useDeliverables';

interface CreateDeliverableDialogProps {
  ipId: string;
  phaseKey: string | null;
  onClose: () => void;
}

export function CreateDeliverableDialog({ ipId, phaseKey, onClose }: CreateDeliverableDialogProps) {
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('word');
  const [network, setNetwork] = useState<'OA' | 'HPC'>('OA');
  const create = useCreateDeliverable(ipId);

  const handleCreate = () => {
    if (!phaseKey || !name.trim()) return;
    create.mutate(
      { name: name.trim(), phaseKey, docType, network },
      { onSuccess: () => { setName(''); onClose(); } },
    );
  };

  return (
    <Dialog open={Boolean(phaseKey)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>산출물 추가 ({phaseKey})</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="이름" value={name} onChange={(e) => setName(e.target.value)} autoFocus size="small" />
          <TextField label="문서 종류" value={docType} onChange={(e) => setDocType(e.target.value)} size="small" />
          <Select size="small" value={network} onChange={(e) => setNetwork(e.target.value as 'OA' | 'HPC')}>
            <MenuItem value="OA">OA</MenuItem>
            <MenuItem value="HPC">HPC</MenuItem>
          </Select>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || create.isPending}>
          추가
        </Button>
      </DialogActions>
    </Dialog>
  );
}
