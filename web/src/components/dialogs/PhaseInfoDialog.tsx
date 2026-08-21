import { Box } from '@mui/material';
import { PhaseRef } from '@/types/domain';
import { CanvasNode, latR, stOf } from '@/lib/canvasModel';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Card, Ey, Row } from '@/components/common/Panel';
import { DocIcon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  ipName: string;
  phase: PhaseRef;
  nodes: CanvasNode[];
  onClose: () => void;
  onOpenRow: (id: string) => void;
}

/** 목업 phInfoH() — Phase 정보 (읽기 전용, 설계서 3.2) */
export function PhaseInfoDialog({ ipName, phase: p, nodes, onClose, onOpenRow }: Props) {
  const ds = nodes.filter((d) => d.phase === p.key).sort((a, b) => a.x - b.x);
  const days = Math.max(1, Math.round((+new Date(p.end) - +new Date(p.start)) / 864e5));
  const t = new Date();
  const st = new Date(p.start);
  const en = new Date(p.end);
  const state =
    t < st ? { t: 'Upcoming', c: T.dm, b: T.sf2, d: T.ln }
    : t > en ? { t: 'Done', c: T.dm, b: T.sf2, d: T.ln }
    : { t: 'In progress', c: T.tl, b: T.tl2, d: T.tl3 };
  const rel = ds.filter((d) => latR(d)).length;

  const stat = (label: string, value: string, color?: string) => (
    <Card sx={{ flex: 1 }}>
      <Ey>{label}</Ey>
      <Box sx={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, mt: '5px', color }}>{value}</Box>
    </Card>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      width={600}
      header={
        <>
          <Ey>{ipName} · PHASE</Ey>
          <Box sx={{ fontSize: 19, fontWeight: 700, mt: '2px', display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Box component="span" sx={{ fontFamily: FONT_MONO }}>{p.key}</Box>
            <Box component="span" sx={{ fontSize: 14, fontWeight: 400, color: T.dm }}>{p.label}</Box>
            <Badge color={state.c} bg={state.b} borderColor={state.d}>{state.t}</Badge>
          </Box>
        </>
      }
    >
      <Row sx={{ mb: '13px' }}>
        {stat('Start', p.start)}
        {stat('End', p.end)}
        {stat('Duration', `${days}d`)}
        {stat('Released', `${rel}/${ds.length}`, T.tl)}
      </Row>
      <Card>
        <Ey sx={{ mb: '10px' }}>Key Deliverables</Ey>
        {ds.length ? (
          ds.map((d) => {
            const s = stOf(d);
            const r = latR(d);
            return (
              <Box
                key={d.id}
                onClick={() => onOpenRow(d.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0',
                  borderBottom: `1px solid ${T.ln}`, cursor: CURSOR_POINTER,
                  '&:hover': { background: T.sf2 },
                }}
              >
                <Box component="span" sx={{ color: d.net === 'HPC' ? T.hp : T.bl }}>
                  <DocIcon type={d.type} />
                </Box>
                <Box sx={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                  {d.name}
                  {d.seriesTotal > 1 && (
                    <Box
                      component="span"
                      sx={{
                        fontFamily: FONT_MONO, fontSize: 9, fontWeight: 600, padding: '1px 5px', ml: '4px',
                        borderRadius: '9px', background: T.vi2, color: T.vi, border: `1px solid ${T.vi3}`,
                      }}
                    >
                      {d.seriesIdx}/{d.seriesTotal}
                    </Box>
                  )}
                </Box>
                <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2 }}>
                  {r ? `v${r.major}.${r.minor}` : ''}
                </Box>
                <Badge color={s.c} bg={s.bg} borderColor={s.bd}>{s.lb}</Badge>
              </Box>
            );
          })
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No deliverables</Box>
        )}
      </Card>
    </ModalShell>
  );
}
