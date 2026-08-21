import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { DeliverableDto } from '@/types/domain';
import { DocIcon, Icon } from '@/components/common/Icon';
import { Chip } from '@/components/common/SirenButton';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

interface Props {
  incoming: DeliverableDto[];
  onOpen: (id: string) => void;
}

/**
 * 이 IP가 다른 Analog IP로부터 받아야 하는 산출물 — 이 IP가 "주는" 산출물을 그리는
 * Canvas와는 UI적으로 완전히 분리된 별도 트레이. 항상 Release 버전만 보이며(BE가
 * incoming[]을 그렇게 필터링해서 내려준다), 주는 쪽이 release()하면 이 목록도
 * 짧은 폴링 주기 안에 새 버전을 그대로 반영한다 — own 산출물(캔버스)과 달리
 * 드래그/편집 대상이 아니라 읽기 전용 카드로만 표시한다.
 */
export function IncomingArtifactsPanel({ incoming, onOpen }: Props) {
  const [open, setOpen] = useState(true);

  const bySource = useMemo(() => {
    const groups = new Map<string, { name: string; color: string; items: DeliverableDto[] }>();
    incoming.forEach((d) => {
      if (!d.sourceIp) return;
      const key = d.sourceIp.id;
      if (!groups.has(key)) groups.set(key, { name: d.sourceIp.name, color: d.sourceIp.color, items: [] });
      groups.get(key)!.items.push(d);
    });
    return Array.from(groups.values());
  }, [incoming]);

  if (!incoming.length) return null;

  return (
    <Box sx={{ borderBottom: `1px solid ${T.ln}`, background: T.sf2, flex: '0 0 auto' }}>
      <Box
        component="button"
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
          padding: '9px 16px', background: 'none', border: 'none', fontFamily: 'inherit',
          cursor: CURSOR_POINTER, color: T.dm,
        }}
      >
        <Box sx={{ color: T.vi, display: 'flex' }}>
          <Icon name="dn" size={12} />
        </Box>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, letterSpacing: '.13em', textTransform: 'uppercase' }}>
          Incoming from other IPs
        </Box>
        <Chip tone="v">{incoming.length}</Chip>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.15s', display: 'flex' }}>
          <Icon name="dn" size={11} />
        </Box>
      </Box>

      {open && (
        <Box sx={{ display: 'flex', gap: '10px', padding: '0 16px 12px', overflowX: 'auto' }}>
          {bySource.map((g) => (
            <Box key={g.name} sx={{ display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'stretch' }}>
              {g.items.map((d) => (
                <IncomingCard key={d.id} d={d} sourceColor={g.color} onOpen={onOpen} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function IncomingCard({ d, sourceColor, onOpen }: { d: DeliverableDto; sourceColor: string; onOpen: (id: string) => void }) {
  const rel = d.releasedVersion;
  return (
    <Box
      component="button"
      onClick={() => onOpen(d.id)}
      sx={{
        display: 'flex', flexDirection: 'column', gap: '5px', width: 200, textAlign: 'left',
        background: T.sf, border: `1px dashed ${T.ln3}`, borderRadius: '10px', padding: '9px 10px',
        fontFamily: 'inherit', cursor: CURSOR_POINTER, flex: '0 0 auto',
        '&:hover': { borderColor: T.vi, boxShadow: T.sm },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: sourceColor, flex: '0 0 auto' }} />
        <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.sourceIp?.name}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <Box component="span" sx={{ color: T.dm, mt: '2px' }}>
          <DocIcon type={d.docType} size={12} />
        </Box>
        <Box sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: T.tx }}>{d.name}</Box>
      </Box>
      <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 9.5, color: T.dm2 }}>{d.phaseKey}</Box>
        {rel ? (
          <Chip tone="s" sx={{ fontSize: 9.5, padding: '1px 6px' }}>v{rel.major}.{rel.minor}</Chip>
        ) : (
          <Chip sx={{ fontSize: 9.5, padding: '1px 6px' }}>Not released yet</Chip>
        )}
      </Box>
    </Box>
  );
}
