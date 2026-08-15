import { useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { LaneGeom, isTodayInPhase } from '@/lib/laneGeometry';
import { PhaseRef } from '@/types/domain';
import { minLaneWidth } from '@/lib/laneGeometry';
import { tokens } from '@/theme/theme';

interface PhaseLanesProps {
  lanes: LaneGeom[];
  phases: PhaseRef[];
  height: number;
  zoom: number;
  isEditing: boolean;
  flashedLaneKey: string | null;
  onResizeLane: (phaseKey: string, width: number) => void;
}

/** Phase 레인 배경 + Today 강조 + (편집 모드) 우측 경계 드래그로 레인 폭 조절 (설계서 3.2-6, 3.7). */
export function PhaseLanes({ lanes, phases, height, zoom, isEditing, flashedLaneKey, onResizeLane }: PhaseLanesProps) {
  const resizeSession = useRef<{ phaseKey: string; startClientX: number; startWidth: number } | null>(null);

  const onHandlePointerDown = (e: React.PointerEvent, lane: LaneGeom) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizeSession.current = { phaseKey: lane.key, startClientX: e.clientX, startWidth: lane.width };
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const s = resizeSession.current;
    if (!s) return;
    const delta = (e.clientX - s.startClientX) / zoom;
    const next = Math.max(minLaneWidth(1), Math.round(s.startWidth + delta));
    onResizeLane(s.phaseKey, next);
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    if (!resizeSession.current) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    resizeSession.current = null;
  };

  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {lanes.map((lane, i) => {
        const phase = phases.find((p) => p.key === lane.key);
        const isToday = phase ? isTodayInPhase(phase) : false;
        const isFlashed = flashedLaneKey === lane.key;
        return (
          <Box
            key={lane.key}
            sx={{
              position: 'absolute',
              left: lane.x,
              top: 0,
              width: lane.width,
              height,
              bgcolor: isToday ? tokens.today : i % 2 === 0 ? tokens.laneAlt : tokens.surface,
              borderRight: `1px solid ${isFlashed ? tokens.primary : tokens.border}`,
              borderTop: isToday ? `2px solid ${tokens.todayBorder}` : 'none',
              transition: 'border-color .2s',
              boxSizing: 'border-box',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                position: 'sticky',
                top: 4,
                left: 4,
                display: 'inline-block',
                px: 0.5,
                color: tokens.textMuted,
                fontWeight: isToday ? 700 : 400,
              }}
            >
              {lane.label}
            </Typography>

            {isEditing && (
              <Box
                onPointerDown={(e) => onHandlePointerDown(e, lane)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                sx={{
                  position: 'absolute',
                  right: -4,
                  top: 0,
                  width: 8,
                  height: '100%',
                  cursor: 'col-resize',
                  touchAction: 'none',
                  zIndex: 5,
                  '&:hover': { bgcolor: `${tokens.primary}33` },
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
