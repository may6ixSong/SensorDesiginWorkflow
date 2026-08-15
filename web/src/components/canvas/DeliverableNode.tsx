import { useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { DeliverableDto, Layout } from '@/types/domain';
import { LaneGeom } from '@/lib/laneGeometry';
import { tokens } from '@/theme/theme';
import { useBlockDrag } from './useBlockDrag';

interface DeliverableNodeProps {
  deliverable: DeliverableDto;
  layout: Layout;
  ipColor: string;
  lanes: LaneGeom[];
  zoom: number;
  isEditing: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onCommitLayout: (id: string, layout: Layout, phaseKey: string) => void;
  onBoundaryFlash: (laneKey: string) => void;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

export function DeliverableNode({
  deliverable: d,
  layout,
  ipColor,
  lanes,
  zoom,
  isEditing,
  isSelected,
  isHighlighted,
  isDimmed,
  onCommitLayout,
  onBoundaryFlash,
  onSelect,
  onOpenDetail,
}: DeliverableNodeProps) {
  const [hovered, setHovered] = useState(false);
  const { elRef, onPointerDown, onPointerMove, onPointerUp } = useBlockDrag({
    layout,
    phaseKey: d.phaseKey,
    lanes,
    zoom,
    enabled: isEditing && d.canEdit,
    onCommit: (l, phaseKey) => onCommitLayout(d.id, l, phaseKey),
    onBoundaryFlash,
  });

  const showDetailButton = !isEditing && isHighlighted && hovered;

  return (
    <Box
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        onSelect(d.id);
      }}
      sx={{
        position: 'absolute',
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
        cursor: isEditing && d.canEdit ? 'grab' : 'pointer',
        touchAction: 'none',
        borderRadius: 1.5,
        border: `1px solid ${isSelected ? ipColor : tokens.border}`,
        borderLeft: `4px solid ${ipColor}`,
        bgcolor: tokens.surface,
        boxShadow: isSelected ? `0 0 0 2px ${ipColor}55` : '0 1px 2px rgba(15,23,42,.06)',
        opacity: isDimmed ? 0.35 : 1,
        transition: isDimmed || isSelected ? 'opacity .15s, box-shadow .15s' : 'none',
        p: 1,
        overflow: 'hidden',
        zIndex: isSelected ? 3 : 2,
      }}
    >
      <Stack spacing={0.5} height="100%">
        <Stack direction="row" spacing={0.5} alignItems="center">
          <DescriptionOutlinedIcon sx={{ fontSize: 14, color: tokens.textMuted }} />
          <Typography variant="caption" fontWeight={600} noWrap title={d.name}>
            {d.name}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Chip
            label={d.network}
            size="small"
            sx={{
              height: 16,
              fontSize: 10,
              bgcolor: d.network === 'OA' ? `${tokens.networkOA}22` : `${tokens.networkHPC}22`,
              color: d.network === 'OA' ? tokens.networkOA : tokens.networkHPC,
            }}
          />
          {d.seriesTotal > 1 && (
            <Chip
              icon={<AutorenewIcon sx={{ fontSize: 12 }} />}
              label={`${d.seriesIdx}/${d.seriesTotal}`}
              size="small"
              sx={{ height: 16, fontSize: 10 }}
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap>
          {d.releasedVersion ? `v${d.releasedVersion.major}.${d.releasedVersion.minor}` : '미등록'}
          {d.workingVersion ? ` · draft v${d.workingVersion.major}.${d.workingVersion.minor}` : ''}
        </Typography>
      </Stack>

      {showDetailButton && (
        <Button
          size="small"
          variant="contained"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(d.id);
          }}
          sx={{
            position: 'absolute',
            top: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 11,
            py: 0.25,
            px: 1,
            minWidth: 0,
            zIndex: 4,
          }}
        >
          상세
        </Button>
      )}
    </Box>
  );
}
