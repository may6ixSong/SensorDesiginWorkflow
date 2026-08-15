import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import { DeliverableDto, PhaseRef, UserDto } from '@/types/domain';
import { RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import {
  useAddVersion,
  useDeleteDeliverable,
  useDeliverableVersions,
  useRelease,
  useUpdateDeliverable,
  useUpdateRecv,
  useUpdateSchedule,
  useUploadUrl,
} from '@/api/hooks/useDeliverables';
import { useUsers } from '@/api/hooks/useUsers';

interface DeliverableDialogProps {
  ipId: string;
  phases: PhaseRef[];
  deliverable: DeliverableDto | null;
  onClose: () => void;
}

/** 개요 / 버전 이력 / 전달 3탭 (설계서 7.1 컴포넌트 트리). */
export function DeliverableDialog({ ipId, phases, deliverable, onClose }: DeliverableDialogProps) {
  const [tab, setTab] = useState(0);

  if (!deliverable) return null;
  const d = deliverable;

  return (
    <Dialog open={Boolean(deliverable)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{d.name}</span>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
        <Tab label="개요" />
        <Tab label="버전 이력" />
        <Tab label="전달" />
      </Tabs>
      <DialogContent dividers>
        {tab === 0 && <OverviewTab ipId={ipId} phases={phases} deliverable={d} onClose={onClose} />}
        {tab === 1 && <VersionsTab ipId={ipId} deliverable={d} />}
        {tab === 2 && <RecvTab ipId={ipId} deliverable={d} />}
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab({ ipId, phases, deliverable: d, onClose }: { ipId: string; phases: PhaseRef[]; deliverable: DeliverableDto; onClose: () => void }) {
  const [name, setName] = useState(d.name);
  const [docType, setDocType] = useState(d.docType);
  const [network, setNetwork] = useState<'OA' | 'HPC'>(d.network);
  const [scheduleKeys, setScheduleKeys] = useState<string[]>(
    d.series ? [] : phases.filter((p) => p.key === d.phaseKey).map((p) => p.key),
  );

  const update = useUpdateDeliverable(ipId);
  const remove = useDeleteDeliverable(ipId);
  const schedule = useUpdateSchedule(ipId);

  return (
    <Stack spacing={2}>
      <TextField label="이름" value={name} onChange={(e) => setName(e.target.value)} disabled={!d.canEdit} size="small" />
      <Stack direction="row" spacing={2}>
        <TextField label="문서 종류" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={!d.canEdit} size="small" fullWidth />
        <Select size="small" value={network} onChange={(e) => setNetwork(e.target.value as 'OA' | 'HPC')} disabled={!d.canEdit} sx={{ minWidth: 120 }}>
          <MenuItem value="OA">OA</MenuItem>
          <MenuItem value="HPC">HPC</MenuItem>
        </Select>
      </Stack>
      <Typography variant="caption" color="text.secondary">현재 Phase: {d.phaseKey}</Typography>

      {!d.series && (
        <>
          <Divider />
          <Typography variant="subtitle2">Release 일정 (여러 Phase에 반복 릴리스, 설계서 3.6)</Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
            {phases.map((p) => {
              const checked = scheduleKeys.includes(p.key) || p.key === d.phaseKey;
              return (
                <Chip
                  key={p.key}
                  label={p.key}
                  color={checked ? 'primary' : 'default'}
                  variant={checked ? 'filled' : 'outlined'}
                  onClick={() => {
                    if (!d.canEdit) return;
                    setScheduleKeys((prev) =>
                      prev.includes(p.key) ? prev.filter((k) => k !== p.key) : [...prev, p.key],
                    );
                  }}
                  disabled={!d.canEdit}
                />
              );
            })}
          </Stack>
          {d.seriesTotal > 1 && (
            <Typography variant="caption">현재 {d.seriesTotal}개 회차로 구성되어 있습니다.</Typography>
          )}
        </>
      )}

      {d.canEdit && (
        <Stack direction="row" spacing={1} justifyContent="space-between">
          <Button color="error" onClick={() => { remove.mutate(d.id); onClose(); }}>
            삭제
          </Button>
          <Stack direction="row" spacing={1}>
            {!d.series && (
              <Button
                onClick={() => schedule.mutate({ id: d.id, phaseKeys: Array.from(new Set([d.phaseKey, ...scheduleKeys])) })}
                disabled={schedule.isPending}
              >
                일정 저장
              </Button>
            )}
            <Button
              variant="contained"
              onClick={() => update.mutate({ id: d.id, name, docType, network })}
              disabled={update.isPending}
            >
              저장
            </Button>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

function VersionsTab({ ipId, deliverable: d }: { ipId: string; deliverable: DeliverableDto }) {
  const { data: versions } = useDeliverableVersions(d.id);
  const uploadUrl = useUploadUrl();
  const addVersion = useAddVersion(ipId);
  const release = useRelease(ipId);
  const [note, setNote] = useState('');
  const [hpcPath, setHpcPath] = useState('');

  const handleFileUpload = async (file: File) => {
    if (d.network === 'OA') {
      const presigned = await uploadUrl.mutateAsync({ id: d.id, fileName: file.name, contentType: file.type });
      if (!presigned.uploadUrl.startsWith('mock://')) {
        await axios.put(presigned.uploadUrl, file, { headers: presigned.headers });
      }
      await addVersion.mutateAsync({ id: d.id, storageKey: presigned.storageKey, fileName: file.name, note });
    }
    setNote('');
  };

  return (
    <Stack spacing={2}>
      <List dense>
        {(versions ?? []).map((v, i) => (
          <ListItem key={i} divider>
            <ListItemText
              primary={`v${v.major}.${v.minor} ${v.kind === 'major' ? '(Released)' : '(작업중)'}`}
              secondary={`${v.fileName ?? v.hpcPath ?? ''} · ${new Date(v.createdAt).toLocaleString()} ${v.note ? `· ${v.note}` : ''}`}
            />
          </ListItem>
        ))}
        {(versions?.length ?? 0) === 0 && (
          <Typography variant="body2" color="text.secondary">등록된 버전이 없습니다.</Typography>
        )}
      </List>

      {d.canEdit && (
        <>
          <Divider />
          <Typography variant="subtitle2">새 버전 업로드 (minor +1)</Typography>
          <TextField label="비고" size="small" value={note} onChange={(e) => setNote(e.target.value)} />
          {d.network === 'OA' ? (
            <Button component="label" variant="outlined">
              파일 선택 및 업로드
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </Button>
          ) : (
            <Stack direction="row" spacing={1}>
              <TextField
                label="HPC 경로 (/vwp/...)"
                size="small"
                fullWidth
                value={hpcPath}
                onChange={(e) => setHpcPath(e.target.value)}
              />
              <Button
                variant="outlined"
                onClick={() => addVersion.mutate({ id: d.id, hpcPath, fileName: hpcPath.split('/').pop() ?? hpcPath, note })}
                disabled={!hpcPath || addVersion.isPending}
              >
                등록
              </Button>
            </Stack>
          )}
          <Button
            variant="contained"
            onClick={() => release.mutate({ id: d.id, note })}
            disabled={release.isPending || !versions?.length}
          >
            Release (major +1)
          </Button>
        </>
      )}
    </Stack>
  );
}

function RecvTab({ ipId, deliverable: d }: { ipId: string; deliverable: DeliverableDto }) {
  const [recvDept, setRecvDept] = useState<string | null>(d.recvDept);
  const [recvContact, setRecvContact] = useState<UserDto | null>(null);
  const { data: candidates } = useUsers(recvDept ?? undefined);
  const updateRecv = useUpdateRecv(ipId);

  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        전달 부서/담당자는 Edit 권한자만 수정할 수 있습니다. recvContact 후보는 recvDept 소속자로 FE가
        필터링하지만, 실제 검증(BE)이 최종 방어선입니다 (설계서 3.4).
      </Typography>
      <Select
        size="small"
        value={recvDept ?? ''}
        displayEmpty
        onChange={(e) => {
          setRecvDept(e.target.value || null);
          setRecvContact(null);
        }}
        disabled={!d.canEdit}
      >
        <MenuItem value="">미지정</MenuItem>
        {RECEIVABLE_DEPARTMENTS.map((dep) => (
          <MenuItem key={dep.id} value={dep.id}>
            {dep.name}
          </MenuItem>
        ))}
      </Select>
      <Autocomplete
        size="small"
        options={candidates ?? []}
        getOptionLabel={(u) => `${u.name} (${departmentName(u.department)})`}
        value={recvContact}
        onChange={(_, value) => setRecvContact(value)}
        disabled={!d.canEdit || !recvDept}
        renderInput={(params) => <TextField {...params} label="담당자 (선택)" />}
      />
      {d.canEdit && (
        <Box>
          <Button
            variant="contained"
            onClick={() => updateRecv.mutate({ id: d.id, recvDept, recvContact: recvContact?.id ?? null })}
            disabled={updateRecv.isPending}
          >
            저장
          </Button>
        </Box>
      )}
    </Stack>
  );
}
