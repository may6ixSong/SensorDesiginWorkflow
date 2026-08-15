import { useState } from 'react';
import { Box, IconButton, Stack, TextField, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { Layout } from '@/types/domain';
import { DraftMemo } from '@/store/canvasStore';
import { LaneGeom } from '@/lib/laneGeometry';
import { tokens } from '@/theme/theme';
import { useBlockDrag } from './useBlockDrag';

interface MemoBlockProps {
  memo: DraftMemo;
  lanes: LaneGeom[];
  zoom: number;
  isEditing: boolean;
  onCommitLayout: (id: string, layout: Layout, phaseKey: string) => void;
  onBoundaryFlash: (laneKey: string) => void;
  onChangeText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

/** 버전 관리 대상이 아닌 설명용 블록. Edit 권한자에게만 노출된다 (설계서 4.7, 6.3). */
export function MemoBlock({ memo, lanes, zoom, isEditing, onCommitLayout, onBoundaryFlash, onChangeText, onDelete }: MemoBlockProps) {
  const [editingText, setEditingText] = useState(false);
  const { elRef, onPointerDown, onPointerMove, onPointerUp } = useBlockDrag({
    layout: memo.layout,
    phaseKey: memo.phaseKey,
    lanes,
    zoom,
    enabled: isEditing,
    onCommit: (l, phaseKey) => onCommitLayout(memo.id, l, phaseKey),
    onBoundaryFlash,
  });

  return (
    <Box
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      sx={{
        position: 'absolute',
        left: memo.layout.x,
        top: memo.layout.y,
        width: memo.layout.w,
        height: memo.layout.h,
        cursor: isEditing ? 'grab' : 'default',
        touchAction: 'none',
        borderRadius: 1.5,
        border: `1px dashed ${tokens.textMuted}`,
        bgcolor: tokens.surfaceAlt,
        p: 1,
        zIndex: 1,
      }}
    >
      {editingText ? (
        <TextField
          autoFocus
          multiline
          size="small"
          fullWidth
          value={memo.text}
          onChange={(e) => onChangeText(memo.id, e.target.value)}
          onBlur={() => setEditingText(false)}
          sx={{ '& .MuiInputBase-root': { fontSize: 12 } }}
        />
      ) : (
        <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', height: '100%' }}>
          {memo.text}
        </Typography>
      )}

      {isEditing && (
        <Stack direction="row" spacing={0.25} sx={{ position: 'absolute', top: -12, right: -8 }}>
          <IconButton size="small" onClick={() => setEditingText(true)} sx={{ bgcolor: tokens.surface, p: 0.25 }}>
            <EditOutlinedIcon sx={{ fontSize: 12 }} />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(memo.id)} sx={{ bgcolor: tokens.surface, p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Stack>
      )}
    </Box>
  );
}
