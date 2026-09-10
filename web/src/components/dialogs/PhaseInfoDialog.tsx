import { Box } from '@mui/material';
import { WorkflowPhase } from '@/types/domain';
import { spanDays, spanState, shortDate } from '@/lib/schedule';
import { CanvasNode, stOf } from '@/lib/canvasModel';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Card, Ey, Row } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  phase: WorkflowPhase;
  nodes: CanvasNode[];
  onClose: () => void;
  onOpenRow: (id: string) => void;
}

/** phase 하나의 정보 (읽기 전용). 여기 이름은 이 workflow가 정한 표기일 뿐 과제 마일스톤이 아니다. */
export function PhaseInfoDialog({ workflowName, phase: p, nodes, onClose, onOpenRow }: Props) {
  const ds = nodes.filter((d) => d.phase === p.id).sort((a, b) => a.x - b.x);
  const days = spanDays(p);
  const state = {
    upcoming: { t: 'Upcoming', c: T.dm, b: T.sf2, d: T.ln },
    past: { t: 'Done', c: T.dm, b: T.sf2, d: T.ln },
    current: { t: 'In progress', c: T.pr, b: T.prSoft, d: T.prLine },
  }[spanState(p)];
  // publish까지 끝난 블록 수 — 캔버스와 같은 3상태 기준을 쓴다(설계서 03장 §2.2).
  const rel = ds.filter((d) => d.publishState === 'published').length;

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
          <Ey>{workflowName} · PHASE</Ey>
          <Box sx={{ fontSize: 19, fontWeight: 700, mt: '2px', display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Box component="span" sx={{ fontFamily: FONT_MONO }}>{p.name}</Box>
            <Box component="span" sx={{ fontSize: 13, fontWeight: 400, color: T.dm, fontFamily: FONT_MONO }}>
              {shortDate(p.start)} → {shortDate(p.end)}
            </Box>
            <Badge color={state.c} bg={state.b} borderColor={state.d}>{state.t}</Badge>
          </Box>
        </>
      }
    >
      <Row sx={{ mb: '13px' }}>
        {stat('Start', p.start)}
        {stat('End', p.end)}
        {stat('Duration', `${days}d`)}
        {stat('Released', `${rel}/${ds.length}`, T.pr)}
      </Row>
      <Card>
        <Ey sx={{ mb: "10px" }}>Blocks in this phase</Ey>
        {ds.length ? (
          ds.map((d) => {
            const s = stOf(d);
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
                <Box component="span" sx={{ color: d.artifactId ? T.pr : T.dm2 }}>
                  <Icon name={d.artifactId ? 'link' : 'unlinked'} />
                </Box>
                <Box sx={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                  {d.name}
                </Box>
                {/* 버전 라벨은 쓰지 않는다 — 상세 slide에서만 보인다(설계서 03장 §2.1). */}
                <Badge color={s.c} bg={s.bg} borderColor={s.bd}>{s.lb}</Badge>
              </Box>
            );
          })
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No blocks</Box>
        )}
      </Card>
    </ModalShell>
  );
}
