import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { DeliverableDto, IpDto, PhaseRef } from '@/types/domain';
import { useDeliverables } from '@/api/hooks/useDeliverables';
import { FONT_MONO, T } from '@/theme/tokens';

const NAME_COL = 220;
const PHASE_COL = 128;

const LEGEND = [
  { key: 'released', label: 'Released', c: T.tl, bg: T.tl2 },
  { key: 'progress', label: 'In progress', c: T.am, bg: T.am2 },
  { key: 'pending', label: 'Not submitted', c: T.dm2, bg: T.sf3 },
] as const;

function statusCounts(deliverables: DeliverableDto[]) {
  let notSubmitted = 0;
  let inProgress = 0;
  let released = 0;
  deliverables.forEach((d) => {
    if (!d.versions.length) notSubmitted++;
    else if (d.workingVersion) inProgress++;
    else released++;
  });
  return { notSubmitted, inProgress, released, total: deliverables.length };
}

function phaseState(p: PhaseRef, now: number): 'upcoming' | 'current' | 'done' {
  const st = new Date(p.start).getTime();
  const en = new Date(p.end).getTime();
  return now < st ? 'upcoming' : now > en ? 'done' : 'current';
}

/**
 * "한 판" 마일스톤×IP 현황판 — Phase를 열로, IP를 행으로 두고 각 칸에 그 IP가
 * 해당 Phase에 가진 산출물 상태(released/in progress/not submitted)를 비율 막대로
 * 요약한다. 기존에 따로 있던 마일스톤 타임라인과 IP 대시보드를 하나로 합친 것.
 */
export function MilestoneIpBoard({ projectId, phases, ips }: { projectId: string; phases: PhaseRef[]; ips: IpDto[] }) {
  const sorted = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const now = Date.now();

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: '14px', mb: '11px', flexWrap: 'wrap' }}>
        {LEGEND.map((l) => (
          <Box key={l.key} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 11, color: T.dm }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '3px', background: l.c }} />
            {l.label}
          </Box>
        ))}
      </Box>

      <Box sx={{ border: `1px solid ${T.ln}`, borderRadius: '12px', background: T.sf, overflow: 'hidden', boxShadow: T.ss }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: `${NAME_COL}px repeat(${sorted.length}, ${PHASE_COL}px)`, minWidth: 'max-content' }}>
            {/* 헤더 행 — Phase(마일스톤) */}
            <Box
              sx={{
                position: 'sticky', left: 0, zIndex: 2, background: T.sf2, borderBottom: `1px solid ${T.ln}`,
                borderRight: `1px solid ${T.ln}`, display: 'flex', alignItems: 'center', padding: '10px 14px',
                fontSize: 10, fontFamily: FONT_MONO, letterSpacing: '.08em', color: T.dm2,
              }}
            >
              IP \ MILESTONE
            </Box>
            {sorted.map((p) => {
              const state = phaseState(p, now);
              const tone = {
                upcoming: { c: T.dm2, bg: T.sf2 },
                current: { c: T.tl, bg: T.tl2 },
                done: { c: T.dm, bg: T.sf3 },
              }[state];
              const days = Math.max(1, Math.round((+new Date(p.end) - +new Date(p.start)) / 864e5));
              return (
                <Box
                  key={p.key}
                  sx={{
                    borderBottom: `1px solid ${T.ln}`, borderLeft: `1px solid ${T.ln}`,
                    background: tone.bg, padding: '9px 10px', textAlign: 'center',
                    ...(state === 'current' ? { boxShadow: `inset 0 2px 0 ${T.tl}` } : {}),
                  }}
                >
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: tone.c }}>{p.key}</Box>
                  <Box sx={{ fontSize: 9.5, color: T.dm2, mt: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </Box>
                  <Box sx={{ fontSize: 8.5, fontFamily: FONT_MONO, color: T.ln3, mt: '3px' }}>{days}d</Box>
                  {state === 'current' && (
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block', fontSize: 8, fontFamily: FONT_MONO, color: '#fff', background: T.tl,
                        borderRadius: '999px', padding: '1px 7px', mt: '4px', fontWeight: 700, letterSpacing: '.05em',
                      }}
                    >
                      NOW
                    </Box>
                  )}
                </Box>
              );
            })}

            {/* IP 행 */}
            {ips.map((ip) => (
              <IpBoardRow key={ip.id} projectId={projectId} ip={ip} phases={sorted} />
            ))}

            {!ips.length && (
              <Box sx={{ gridColumn: `1 / -1`, padding: '24px', fontSize: 12.5, color: T.dm2, textAlign: 'center' }}>
                No viewable IPs under this program.
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function IpBoardRow({ projectId, ip, phases }: { projectId: string; ip: IpDto; phases: PhaseRef[] }) {
  const { data: deliverables } = useDeliverables(ip.id);
  const byPhase = useMemo(() => {
    const m = new Map<string, DeliverableDto[]>();
    (deliverables ?? []).forEach((d) => {
      const arr = m.get(d.phaseKey) ?? [];
      arr.push(d);
      m.set(d.phaseKey, arr);
    });
    return m;
  }, [deliverables]);

  return (
    <>
      <Box
        component={Link}
        to={`/details/${projectId}/${ip.id}`}
        sx={{
          position: 'sticky', left: 0, zIndex: 1, background: T.sf, borderRight: `1px solid ${T.ln}`,
          borderBottom: `1px solid ${T.ln}`, display: 'flex', alignItems: 'center', gap: '9px',
          padding: '11px 14px 11px 12px', textDecoration: 'none', color: 'inherit',
          borderLeft: `3px solid ${ip.color || T.tl}`,
          '&:hover': { background: T.sf2 },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ip.name}
          </Box>
          <Box sx={{ fontSize: 10, color: T.dm2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ip.description || '—'}
          </Box>
        </Box>
      </Box>
      {phases.map((p) => {
        const items = byPhase.get(p.key) ?? [];
        return <PhaseCell key={p.key} items={items} />;
      })}
    </>
  );
}

function PhaseCell({ items }: { items: DeliverableDto[] }) {
  if (!items.length) {
    return (
      <Box
        sx={{
          borderLeft: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
          display: 'grid', placeItems: 'center', padding: '10px 12px',
        }}
      >
        <Box
          sx={{
            width: '100%', height: 5, borderRadius: 999,
            border: `1px dashed ${T.ln2}`,
          }}
        />
      </Box>
    );
  }
  const counts = statusCounts(items);
  const pct = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);
  const title = items
    .map((d) => `${d.name} — ${!d.versions.length ? 'Not submitted' : d.workingVersion ? 'In progress' : 'Released'}`)
    .join('\n');

  return (
    <Box
      title={title}
      sx={{
        borderLeft: `1px solid ${T.ln}`, borderBottom: `1px solid ${T.ln}`,
        padding: '10px 12px', cursor: 'default',
      }}
    >
      <Box sx={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: T.sf3 }}>
        <Box sx={{ width: `${pct(counts.released)}%`, background: T.tl, transition: 'width .3s' }} />
        <Box sx={{ width: `${pct(counts.inProgress)}%`, background: T.am, transition: 'width .3s' }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '3px', mt: '6px' }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: T.tx }}>
          {counts.released}
        </Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2 }}>
          /{counts.total}
        </Box>
      </Box>
    </Box>
  );
}
