import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DeliverableDto } from '@/types/domain';
import { useCreateHldRelease, useHldReleases } from '@/api/hooks/useHld';
import { computeHldDiffRows } from '@/lib/hldDiff';
import { tokens } from '@/theme/theme';

interface HldReleaseDialogProps {
  ipId: string;
  open: boolean;
  onClose: () => void;
  deliverables: DeliverableDto[];
  canEdit: boolean;
  onOpenDeliverable: (id: string) => void;
}

/**
 * HLD Release dialog (설계서 3.10).
 * 행 구성 기준은 "현재 IP에 설정된 산출물 전체" - 이전 HLD 대비 버전이 달라진 행만
 * 단일 하이라이트 색상으로 표시한다(신규/제외 구분 없음). 이 조인/diff는 FE가 계산한다.
 */
export function HldReleaseDialog({ ipId, open, onClose, deliverables, canEdit, onOpenDeliverable }: HldReleaseDialogProps) {
  const { data: releases } = useHldReleases(ipId);
  const createRelease = useCreateHldRelease(ipId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const sorted = useMemo(() => [...(releases ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)), [releases]);
  const current = sorted.find((r) => r._id === selectedId) ?? sorted[0] ?? null;
  const currentIdx = current ? sorted.findIndex((r) => r._id === current._id) : -1;
  const previous = currentIdx >= 0 ? sorted[currentIdx + 1] ?? null : null;

  const rows = current ? computeHldDiffRows(deliverables, current, previous) : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        HLD Release
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Select size="small" value={current?._id ?? ''} onChange={(e) => setSelectedId(e.target.value)} sx={{ minWidth: 160 }}>
            {sorted.map((r) => (
              <MenuItem key={r._id} value={r._id}>
                v{r.version} · {r.date}
              </MenuItem>
            ))}
          </Select>
          {current && (
            <Typography variant="caption" color="text.secondary">
              {current.note}
            </Typography>
          )}
          {canEdit && (
            <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
              <TextField size="small" label="Release Note" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="contained" onClick={() => createRelease.mutate(note)} disabled={createRelease.isPending}>
                새 HLD Release
              </Button>
            </Stack>
          )}
        </Stack>

        {!current && <Typography color="text.secondary">아직 HLD Release가 없습니다.</Typography>}

        {current && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Artifact</TableCell>
                <TableCell>Files/Path</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Released</TableCell>
                <TableCell>Comment</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.deliverableId}
                  hover
                  onClick={() => onOpenDeliverable(row.deliverableId)}
                  sx={{ cursor: 'pointer', bgcolor: row.changed ? `${tokens.primary}14` : 'transparent' }}
                >
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Chip
                        label={row.network}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: 10,
                          bgcolor: row.network === 'OA' ? `${tokens.networkOA}22` : `${tokens.networkHPC}22`,
                        }}
                      />
                      <span>{row.name}</span>
                    </Stack>
                  </TableCell>
                  <TableCell>{row.file ?? <Box component="span" color="text.disabled">-</Box>}</TableCell>
                  <TableCell>{row.version ?? '-'}</TableCell>
                  <TableCell>{row.releasedAt ? new Date(row.releasedAt).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>{row.comment}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
