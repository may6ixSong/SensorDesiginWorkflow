import { Box } from '@mui/material';
import { PhaseRef, DeliverableDto } from '@/types/domain';
import { getPW } from '@/lib/canvasModel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { Chip } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  phases: PhaseRef[];
  phasePW: Record<string, number>;
  z: number;
  panX: number;
  incoming: DeliverableDto[];
  onOpen: (id: string) => void;
}

/**
 * "다른 IP로부터 받는 산출물"을 별도 목록이 아니라, 이 IP의 워크플로우 캔버스 위에
 * 하나의 화면으로 붙여서 보여준다 — Phase별로 이 산출물이 필요한 레인 바로 위에
 * 정렬해, 아래 캔버스와 같은 가로 팬/줌을 공유한다(PhaseStepper와 동일한 기법:
 * translateX(panX) + getPW(p)*z 셀 폭). 실제 캔버스 좌표계(자유 드래그 Y축)에
 * 산출물을 섞지 않는 이유는, 그 산출물이 다른 IP 소유라 이 IP의 레이아웃 저장
 * 대상이 아니고 위치를 영속화할 곳이 없기 때문이다 — 대신 항상 제자리(Phase 헤더
 * 바로 아래)에 고정해 두면 팬/줌해도 절대 화면 밖으로 사라지지 않는다.
 */
export function IncomingLane({ phases, phasePW, z, panX, incoming, onOpen }: Props) {
  if (!incoming.length) return null;

  const byPhase = new Map<string, DeliverableDto[]>();
  incoming.forEach((d) => {
    const arr = byPhase.get(d.phaseKey) ?? [];
    arr.push(d);
    byPhase.set(d.phaseKey, arr);
  });
  const maxPerPhase = Math.max(1, ...Array.from(byPhase.values(), (arr) => arr.length));
  const cardH = 46;
  const rowH = maxPerPhase * cardH + (maxPerPhase - 1) * 4 + 14;

  return (
    <Box sx={{ overflow: 'hidden', borderBottom: `1px dashed ${T.vi3}`, background: T.vi2, flex: '0 0 auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px 0' }}>
        <Icon name="dn" size={10} />
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.13em', textTransform: 'uppercase', color: T.vi }}>
          Incoming from other IPs
        </Box>
        <Chip tone="v" sx={{ fontSize: 9.5, padding: '0 6px' }}>{incoming.length}</Chip>
        <Box sx={{ display: 'flex', gap: '4px', ml: '4px' }}>
          {Array.from(byPhase.entries()).map(([phaseKey, items]) => (
            <Box
              key={phaseKey}
              component="span"
              sx={{
                fontFamily: FONT_MONO, fontSize: 9, color: T.vi, padding: '1px 5px',
                borderRadius: '5px', border: `1px solid ${T.vi3}`, background: T.sf,
              }}
            >
              {phaseKey} · {items.length}
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', whiteSpace: 'nowrap', willChange: 'transform', transform: `translateX(${panX}px)`, height: rowH, mt: '4px' }}>
        {phases.map((p) => {
          const items = byPhase.get(p.key) ?? [];
          const pw = getPW(phasePW, p.key) * z;
          return (
            <Box
              key={p.key}
              sx={{
                flex: `0 0 ${pw}px`, width: `${pw}px`, minWidth: `${pw}px`,
                display: 'flex', flexDirection: 'column', gap: '4px',
                padding: '0 8px', overflow: 'hidden',
              }}
            >
              {items.map((d) => (
                <IncomingCard key={d.id} d={d} h={cardH} onOpen={onOpen} />
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function IncomingCard({ d, h, onOpen }: { d: DeliverableDto; h: number; onOpen: (id: string) => void }) {
  const rel = d.releasedVersion;
  return (
    <Box
      component="button"
      onClick={() => onOpen(d.id)}
      sx={{
        display: 'flex', alignItems: 'center', gap: '6px', height: h, width: '100%', textAlign: 'left',
        background: T.sf, border: `1px dashed ${T.vi3}`, borderRadius: '8px', padding: '0 8px',
        fontFamily: 'inherit', cursor: CURSOR_POINTER, flex: '0 0 auto', overflow: 'hidden',
        '&:hover': { borderColor: T.vi, boxShadow: T.sm },
      }}
    >
      <Box component="span" sx={{ color: d.sourceIp?.color ?? T.dm2, flex: '0 0 auto' }}>
        <DocIcon type={d.docType} size={12} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 11.5, fontWeight: 600, color: T.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.name}
        </Box>
        <Box sx={{ fontSize: 9.5, color: T.dm2, fontFamily: FONT_MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.sourceIp?.name ?? '—'} {rel ? `· v${rel.major}.${rel.minor}` : '· pending'}
        </Box>
      </Box>
    </Box>
  );
}
