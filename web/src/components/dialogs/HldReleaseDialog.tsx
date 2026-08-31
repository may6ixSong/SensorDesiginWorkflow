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

/**
 * 목업 hldDlgH() — HLD Release 그리드.
 * 행 구성 기준은 "현재 IP에 설정된 산출물 전체"이고, 이전 HLD 대비 버전이 달라진 행만
 * 단일 하이라이트로 표시한다 (설계서 3.10). 이 조인/diff는 FE에서 계산한다.
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

  const order: Record<string, number> = {};
  phases.forEach((p, i) => (order[p.id] = i));
  const rows = [...nodes].sort((a, b) =>
    (order[a.phase] ?? 99) !== (order[b.phase] ?? 99)
      ? (order[a.phase] ?? 99) - (order[b.phase] ?? 99)
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
