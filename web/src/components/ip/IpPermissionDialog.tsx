import { useState } from 'react';
import {
  Autocomplete,
  Box,
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
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StarIcon from '@mui/icons-material/Star';
import { IpDto, UserDto } from '@/types/domain';
import { DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { useUsers } from '@/api/hooks/useUsers';
import { useAddOwner, useAddViewGrant, useRemoveOwner, useRemoveViewGrant } from '@/api/hooks/useIp';

interface IpPermissionDialogProps {
  ip: IpDto;
  open: boolean;
  onClose: () => void;
}

/**
 * IP 권한 관리 dialog (설계서 3.3, 5.2).
 * Edit(owners) 후보는 Analog 부서로 필터링해서 보여주지만, 이는 UX 편의일 뿐이고
 * 실제 방어(department==="analog" 검증)는 BE(addOwner)에서 다시 이뤄진다.
 */
export function IpPermissionDialog({ ip, open, onClose }: IpPermissionDialogProps) {
  const { data: analogUsers } = useUsers('analog');
  const { data: allUsers } = useUsers();
  const [viewGrantDept, setViewGrantDept] = useState<string>('digital');
  const [viewGrantUser, setViewGrantUser] = useState<UserDto | null>(null);

  const addOwner = useAddOwner(ip.id);
  const removeOwner = useRemoveOwner(ip.id);
  const addViewGrant = useAddViewGrant(ip.id);
  const removeViewGrant = useRemoveViewGrant(ip.id);

  const ownerCandidates = (analogUsers ?? []).filter((u) => !ip.owners.some((o) => o.id === u.id));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {ip.name} 권한 관리
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" gutterBottom>
          Edit 권한자 (owners) - Analog 부서만 가능
        </Typography>
        <List dense>
          {ip.owners.map((o, idx) => (
            <ListItem
              key={o.id}
              secondaryAction={
                idx > 0 && (
                  <IconButton size="small" onClick={() => removeOwner.mutate(o.id)} disabled={removeOwner.isPending}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {idx === 0 && <StarIcon sx={{ fontSize: 14, color: 'warning.main' }} />}
                    <span>{o.name}</span>
                  </Stack>
                }
                secondary={idx === 0 ? '대표 담당자 (삭제 불가)' : departmentName(o.department)}
              />
            </ListItem>
          ))}
        </List>
        <Autocomplete
          size="small"
          options={ownerCandidates}
          getOptionLabel={(u) => `${u.name} (${u.empNo})`}
          onChange={(_, value) => value && addOwner.mutate(value.id)}
          renderInput={(params) => <TextField {...params} label="Analog 담당자 추가" placeholder="이름/사번 검색" />}
          value={null}
        />

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          View 권한자 (viewGrants) - 전 부서 가능, 포지션 지정 필요
        </Typography>
        <List dense>
          {ip.viewGrants.map((g) => (
            <ListItem
              key={g.user.id}
              secondaryAction={
                <IconButton size="small" onClick={() => removeViewGrant.mutate(g.user.id)} disabled={removeViewGrant.isPending}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText primary={g.user.name} secondary={`포지션: ${departmentName(g.department)}`} />
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} alignItems="center">
          <Autocomplete
            size="small"
            sx={{ flex: 1 }}
            options={allUsers ?? []}
            getOptionLabel={(u) => `${u.name} (${u.empNo})`}
            value={viewGrantUser}
            onChange={(_, value) => setViewGrantUser(value)}
            renderInput={(params) => <TextField {...params} label="사용자 검색" />}
          />
          <Select size="small" value={viewGrantDept} onChange={(e) => setViewGrantDept(e.target.value)} sx={{ width: 140 }}>
            {DEPARTMENTS.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </Select>
          <IconButton
            color="primary"
            disabled={!viewGrantUser || addViewGrant.isPending}
            onClick={() => {
              if (!viewGrantUser) return;
              addViewGrant.mutate({ userId: viewGrantUser.id, department: viewGrantDept });
              setViewGrantUser(null);
            }}
          >
            추가
          </IconButton>
        </Stack>
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            포지션은 실제 소속과 다르게 지정할 수 있습니다(예: 실제 Digital 소속이 이 프로젝트에서는 Solution 포지션으로 참여). 이 값은 산출물의 "전달 받을 부서" 후보와 연동됩니다.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
