import { Paper, Stack, Button, Tooltip, CircularProgress } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';

interface FloatingToolboxProps {
  canEdit: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onEnterEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onAddDeliverable: () => void;
  onAddMemo: () => void;
  onAutoFit: () => void;
}

/** 좌하단 편집모드 토글/취소/추가 툴박스 (설계서 7.1 컴포넌트 트리). */
export function FloatingToolbox({
  canEdit,
  isEditing,
  isSaving,
  onEnterEdit,
  onSave,
  onCancel,
  onAddDeliverable,
  onAddMemo,
  onAutoFit,
}: FloatingToolboxProps) {
  if (!canEdit) return null;

  return (
    <Paper elevation={3} sx={{ position: 'absolute', left: 12, bottom: 12, p: 1, borderRadius: 2, zIndex: 7 }}>
      <Stack direction="row" spacing={1}>
        {!isEditing ? (
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onEnterEdit}>
            편집
          </Button>
        ) : (
          <>
            <Button
              size="small"
              variant="contained"
              startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />}
              onClick={onSave}
              disabled={isSaving}
            >
              저장
            </Button>
            <Button size="small" color="inherit" startIcon={<CloseIcon />} onClick={onCancel} disabled={isSaving}>
              취소
            </Button>
            <Tooltip title="산출물 추가">
              <Button size="small" startIcon={<AddOutlinedIcon />} onClick={onAddDeliverable}>
                산출물
              </Button>
            </Tooltip>
            <Tooltip title="메모 추가">
              <Button size="small" startIcon={<NoteAddOutlinedIcon />} onClick={onAddMemo}>
                메모
              </Button>
            </Tooltip>
            <Tooltip title="Auto Fit - 겹침 없는 지그재그 배치로 정리">
              <Button size="small" startIcon={<AutoFixHighOutlinedIcon />} onClick={onAutoFit}>
                Auto Fit
              </Button>
            </Tooltip>
          </>
        )}
      </Stack>
    </Paper>
  );
}
