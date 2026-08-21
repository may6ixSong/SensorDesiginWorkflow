import { Box } from '@mui/material';
import { DeliverableDto, PhaseRef, UserDto } from '@/types/domain';
import { fmtAt } from '@/lib/canvasModel';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { DocIcon, Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { toast } from '@/store/toastStore';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  d: DeliverableDto | null;
  phases: PhaseRef[];
  usersById: Map<string, UserDto>;
  onClose: () => void;
}

/**
 * 다른 IP로부터 받는 산출물의 읽기 전용 상세 — DeliverableDialog와 달리 탭도,
 * 편집/업로드/Release 버튼도 없다. 항상 released 버전만 보여준다(전달받은 DeliverableDto
 * 자체가 BE에서 그렇게 필터링돼 온다) — 이 규칙은 조회자가 우연히 sourceIp의
 * owner여도 예외 없이 적용된다(BE toIncomingDeliverableDto 참고).
 */
export function IncomingDeliverableDialog({ d, phases, usersById, onClose }: Props) {
  if (!d) return null;
  const ph = phases.find((p) => p.key === d.phaseKey);
  const rel = d.releasedVersion;
  const by = rel ? usersById.get(rel.by) : undefined;

  return (
    <ModalShell
      open
      onClose={onClose}
      width={520}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Box component="span" sx={{ color: d.network === 'HPC' ? T.hp : T.bl, mt: '4px' }}>
            <DocIcon type={d.docType} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey>{ph ? `${ph.key} · ${ph.label}` : ''}</Ey>
            <Box sx={{ fontSize: 18, fontWeight: 700, mt: '3px' }}>{d.name}</Box>
          </Box>
          <Badge color={T.vi} bg={T.vi2} borderColor={T.vi3} sx={{ mt: '6px' }}>Incoming</Badge>
        </Box>
      }
    >
      <Card sx={{ mb: '12px', display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: d.sourceIp?.color ?? T.dm2, flex: '0 0 auto' }} />
        <Box sx={{ flex: 1 }}>
          <Ey>From</Ey>
          <Box sx={{ fontSize: 14, fontWeight: 700, mt: '2px' }}>{d.sourceIp?.name ?? 'Unknown IP'}</Box>
        </Box>
        <Badge
          color={d.network === 'HPC' ? T.hp : T.dm}
          bg={d.network === 'HPC' ? T.hp2 : T.sf2}
          borderColor={d.network === 'HPC' ? T.hp3 : T.ln}
        >
          {d.network} network
        </Badge>
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey>Released version</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.tl, mt: '6px' }}>
          {rel ? `v${rel.major}.${rel.minor}` : '—'}
        </Box>
        {rel ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mt: '7px' }}>
            <UserAvatar user={by} size={22} />
            <Box sx={{ fontSize: 12, color: T.dm }}>{by?.name ?? '—'} · {fmtAt(rel.at)}</Box>
          </Box>
        ) : (
          <Box sx={{ fontSize: 12, color: T.dm2, mt: '7px' }}>
            {d.sourceIp?.name ?? 'The owning IP'} hasn't released a version yet — this card will update the moment they do.
          </Box>
        )}
        {rel?.note && <Box sx={{ fontSize: 12, color: T.dm, mt: '7px' }}>{rel.note}</Box>}
      </Card>

      <Card>
        <Ey sx={{ mb: '7px' }}>{d.network === 'HPC' ? 'HPC vwp path' : 'Current file'}</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ color: T.dm }}><DocIcon type={d.docType} /></Box>
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, wordBreak: 'break-all' }}>
            {rel?.file || 'Nothing released yet'}
          </Box>
        </Box>
        <Box sx={{ mt: '11px' }}>
          {d.network === 'HPC' ? (
            <SirenButton
              disabled={!rel}
              onClick={() => { if (rel) { navigator.clipboard?.writeText(rel.file); toast('Path copied'); } }}
            >
              <Icon name="copy" /> Copy path
            </SirenButton>
          ) : (
            <SirenButton disabled={!rel} onClick={() => toast('Downloads will be available once storage is connected')}>
              <Icon name="dn" /> Download file
            </SirenButton>
          )}
        </Box>
      </Card>
    </ModalShell>
  );
}
