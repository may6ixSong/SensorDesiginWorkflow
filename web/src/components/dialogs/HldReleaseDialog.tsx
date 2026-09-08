import { useMemo } from 'react';
import { Box } from '@mui/material';
import { HldReleaseDto, WorkflowPhase } from '@/types/domain';
import { CanvasNode } from '@/lib/canvasModel';
import { departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { SelectBox } from '@/components/layout/SelectBox';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  workflowName: string;
  releases: HldReleaseDto[];
  nodes: CanvasNode[];
  phases: WorkflowPhase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onOpenRow: (deliverableId: string) => void;
}

/** 표에 그릴 최소한의 행 모양 — 스냅샷 산출물이든 라이브 캔버스 노드든 이 모양으로 맞춘다. */
interface Row {
  id: string;
  name: string;
  phaseId: string;
  x: number;
  net: 'OA' | 'HPC';
}

/**
 * 목업 hldDlgH() — HLD Release 그리드.
 *
 * §19.4부터는 그 release 문서 자신의 canvas 스냅샷에서 행을 뽑는다 - flow 연결이나
 * 캔버스 배치가 그 뒤로 바뀌었을 수 있어, 지금의 라이브 캔버스와 과거 버전 표를
 * 섞어 쓰면 그 시점에 없던/이미 없어진 배치가 있었던 것처럼 보인다(실측 확인된 문제).
 * canvas가 비어 있는(§19.4 이전) 옛 스냅샷만 예외적으로 라이브 nodes/phases로
 * 폴백한다 — 소급해서 구조를 채울 방법이 없기 때문이다.
 */
export function HldReleaseDialog({
  workflowName, releases, nodes, phases, selectedId, onSelect, onClose, onOpenRow,
}: Props) {
  const { resolveUser } = useDirectory();
  const sorted = useMemo(() => [...releases].sort((a, b) => (a.date < b.date ? 1 : -1)), [releases]);

  if (!sorted.length) {
    return (
      <ModalShell
        open
        onClose={onClose}
        width={520}
        header={
          <>
            <Ey>{workflowName}</Ey>
            <Box sx={{ fontSize: 16, fontWeight: 700, mt: '2px' }}>HLD Release</Box>
          </>
        }
      >
        <Card sx={{ color: T.dm2, fontSize: 12.5 }}>No HLD releases yet</Card>
      </ModalShell>
    );
  }

  const cur = sorted.find((h) => h._id === selectedId) ?? sorted[0];
  const prev = sorted[sorted.findIndex((h) => h._id === cur._id) + 1] ?? null;

  // canvas가 없는(§19.4 이전) 옛 스냅샷만 라이브 nodes/phases로 폴백한다 - 소급해서
  // 그 시점 구조를 재구성할 방법이 없기 때문이다. 그 외에는 항상 그 release 자신의 canvas를 쓴다.
  const hasSnapshot = (cur.canvas?.deliverables?.length ?? 0) > 0;
  const rowPhases = hasSnapshot ? cur.canvas.phases : phases;
  const rows: Row[] = hasSnapshot
    ? cur.canvas.deliverables.map((d) => ({ id: d.id, name: d.name, phaseId: d.phaseId, x: d.layout.x, net: 'OA' as const }))
    : nodes.map((d) => ({ id: d.id, name: d.name, phaseId: d.phase, x: d.x, net: d.net }));

  const order: Record<string, number> = {};
  rowPhases.forEach((p, i) => (order[p.id] = i));
  rows.sort((a, b) =>
    (order[a.phaseId] ?? 99) !== (order[b.phaseId] ?? 99)
      ? (order[a.phaseId] ?? 99) - (order[b.phaseId] ?? 99)
      : a.x - b.x,
  );

  const by = resolveUser(cur.releasedBy);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={880}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
          <Box component="span" sx={{ color: T.tl, mt: '3px' }}><Icon name="grid" /></Box>
          <Box sx={{ flex: 1 }}>
            <Ey>{workflowName} · HLD RELEASE</Ey>
            <Box sx={{ fontSize: 18, fontWeight: 700, mt: '2px' }}>
              HLD {cur.version}
              <Box component="span" sx={{ fontSize: 12, fontWeight: 400, color: T.dm, ml: '8px' }}>
                {cur.date}
              </Box>
            </Box>
          </Box>
          <SelectBox
            label="Version"
            value={cur._id}
            onChange={onSelect}
            options={sorted.map((h) => ({ value: h._id, label: `HLD ${h.version} · ${h.date}` }))}
          />
        </Box>
      }
      belowHeader={
        <Box
          sx={{
            display: 'flex', gap: '16px', alignItems: 'flex-start',
            padding: '12px 0 14px', borderBottom: `1px solid ${T.ln}`, mt: '10px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserAvatar user={by} size={28} />
            <Box>
              <Box sx={{ fontSize: 12.5, fontWeight: 600 }}>{by.name}</Box>
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{by.department ? departmentName(by.department) : ''}</Box>
            </Box>
          </Box>
          <Box sx={{ flex: 1, borderLeft: `1px solid ${T.ln}`, pl: '16px' }}>
            <Ey sx={{ mb: '4px' }}>Release Note</Ey>
            <Box sx={{ fontSize: 12.5, lineHeight: 1.55 }}>{cur.note}</Box>
          </Box>
        </Box>
      }
    >
      {!hasSnapshot && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.am,
            background: T.am2, border: `1px solid ${T.am3}`, borderRadius: '8px',
            padding: '8px 10px', mb: '10px', lineHeight: 1.6,
          }}
        >
          <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
          This release predates full canvas snapshots — rows and order below are approximated from
          the current live canvas, not the structure as it actually stood at release time.
        </Box>
      )}
      <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '10px', overflow: 'hidden', background: T.sf }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <Box component="thead">
            <Box component="tr" sx={{ background: T.sf2, borderBottom: `1px solid ${T.ln}` }}>
              {[['Artifact', undefined], ['Files/Path', undefined], ['Version', 64], ['Released', 124], ['Comment', undefined]].map(
                ([h, w]) => (
                  <Box
                    key={h as string}
                    component="th"
                    sx={{ textAlign: 'left', padding: '9px 12px', color: T.dm, fontWeight: 600, width: w as number | undefined }}
                  >
                    {h as string}
                  </Box>
                ),
              )}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((d) => {
              const rec = cur.items?.[d.id] ?? null;
              const pv = prev ? prev.items?.[d.id] ?? null : null;
              const changed = prev ? (rec?.version ?? null) !== (pv?.version ?? null) : false;
              return (
                <Box
                  key={d.id}
                  component="tr"
                  onClick={() => onOpenRow(d.id)}
                  sx={{
                    borderBottom: `1px solid ${T.ln}`,
                    cursor: CURSOR_POINTER,
                    ...(changed ? { background: T.hldChanged, boxShadow: `inset 3px 0 0 ${T.am3}` } : {}),
                    '&:hover': { background: changed ? T.hldChangedHover : T.sf2 },
                  }}
                >
                  <Box component="td" sx={{ padding: '9px 12px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>{d.name}</Box>
                      <Badge
                        color={d.net === 'HPC' ? T.hp : T.dm}
                        bg={d.net === 'HPC' ? T.hp2 : T.sf2}
                        borderColor={d.net === 'HPC' ? T.hp3 : T.ln}
                      >
                        {d.net}
                      </Badge>
                    </Box>
                  </Box>
                  <Box component="td" sx={{ padding: '9px 12px' }}>
                    <Box
                      component="span"
                      sx={{
                        fontFamily: FONT_MONO, fontSize: 11.5, wordBreak: 'break-all',
                        color: rec ? (d.net === 'HPC' ? T.hp : T.tx) : T.dm2,
                      }}
                    >
                      {rec?.file ?? ''}
                    </Box>
                  </Box>
                  <Box component="td" sx={{ padding: '9px 12px' }}>
                    <Box component="span" sx={{ fontFamily: FONT_MONO, fontWeight: 600, color: T.tl }}>
                      {rec ? `v${rec.version}` : ''}
                    </Box>
                  </Box>
                  <Box component="td" sx={{ padding: '9px 12px' }}>
                    <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm }}>
                      {rec?.at ?? ''}
                    </Box>
                  </Box>
                  <Box component="td" sx={{ padding: '9px 12px', color: T.dm }}>{rec?.comment ?? ''}</Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </ModalShell>
  );
}
