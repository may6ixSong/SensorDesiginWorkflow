import { Box } from '@mui/material';
import { DeliverableDto } from '@/types/domain';
import { shortDate } from '@/lib/schedule';
import { fmtAt } from '@/lib/canvasModel';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge, SirenButton } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { toast } from '@/store/toastStore';
import { FONT_MONO, T } from '@/theme/tokens';

interface Props {
  d: DeliverableDto | null;
  onClose: () => void;
}

/**
 * 다른 workflow로부터 받는 산출물의 읽기 전용 상세 — DeliverableDialog와 달리 탭도,
 * 편집/업로드/Release 버튼도 없다. 항상 released 버전만 보여준다(전달받은 DeliverableDto
 * 자체가 BE에서 그렇게 필터링돼 온다) — 이 규칙은 조회자가 우연히 sourceWorkflow의
 * owner여도 예외 없이 적용된다(BE toIncomingDeliverableDto 참고).
 */
export function IncomingDeliverableDialog({ d, onClose }: Props) {
  const { resolveUser } = useDirectory();
  if (!d) return null;
  // 여기 뜨는 일정은 "주는 쪽 workflow"의 phase다 — 내 캔버스의 칸 이름이 아니다.
  const ph = d.sourcePhase;
  const rel = d.releasedVersion;
  const by = rel ? resolveUser(rel.giverKnoxId ?? rel.assertedBy ?? '') : undefined;

  return (
    <ModalShell
      open
      onClose={onClose}
      width={520}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Box component="span" sx={{ color: d.serviceKey ? T.tl : T.bl, mt: '4px' }}>
            <Icon name={d.serviceKey ? 'link' : 'word'} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey>{ph ? `${ph.name} · ${shortDate(ph.start)} → ${shortDate(ph.end)}` : 'No schedule on the source workflow'}</Ey>
            <Box sx={{ fontSize: 18, fontWeight: 700, mt: '3px' }}>{d.name}</Box>
            {d.artifactKey && (
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: T.dm2, mt: '2px' }}>{d.artifactKey}</Box>
            )}
          </Box>
          <Badge color={T.vi} bg={T.vi2} borderColor={T.vi3} sx={{ mt: '6px' }}>Incoming</Badge>
        </Box>
      }
    >
      <Card sx={{ mb: '12px', display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: d.sourceWorkflow?.color ?? T.dm2, flex: '0 0 auto' }} />
        <Box sx={{ flex: 1 }}>
          <Ey>Received from</Ey>
          <Box sx={{ fontSize: 14, fontWeight: 700, mt: '2px' }}>{d.sourceWorkflow?.name ?? 'Unknown department'}</Box>
        </Box>
        {d.serviceKey ? (
          <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>{d.serviceKey.toUpperCase()}</Badge>
        ) : (
          <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>Unlinked</Badge>
        )}
      </Card>

      <Card sx={{ mb: '12px' }}>
        <Ey>Released version</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 600, color: T.tl, mt: '6px' }}>
          {rel ? rel.versionLabel : '—'}
        </Box>
        {rel ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mt: '7px' }}>
            <UserAvatar user={by} size={22} />
            <Box sx={{ fontSize: 12, color: T.dm }}>{by?.name ?? '—'} · {fmtAt(rel.at)}</Box>
          </Box>
        ) : (
          <Box sx={{ fontSize: 12, color: T.dm2, mt: '7px' }}>
            {d.sourceWorkflow?.name ?? 'The owning workflow'} hasn't released a version yet — this card will update the moment they do.
          </Box>
        )}
        {rel?.note && <Box sx={{ fontSize: 12, color: T.dm, mt: '7px' }}>{rel.note}</Box>}
      </Card>

      <Card>
        <Ey sx={{ mb: '7px' }}>{rel?.hpcPath ? 'HPC vwp path' : 'View'}</Ey>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Box component="span" sx={{ color: T.dm }}><Icon name={d.serviceKey ? 'link' : 'word'} /></Box>
          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, wordBreak: 'break-all' }}>
            {rel?.hpcPath || rel?.viewUrl || 'Nothing registered yet'}
          </Box>
        </Box>
        <Box sx={{ mt: '11px' }}>
          {rel?.hpcPath ? (
            <SirenButton
              onClick={() => { navigator.clipboard?.writeText(rel.hpcPath as string); toast('Path copied'); }}
            >
              <Icon name="copy" /> Copy path
            </SirenButton>
          ) : (
            <SirenButton
              disabled={!rel?.viewUrl}
              onClick={() => { if (rel?.viewUrl) window.open(rel.viewUrl, '_blank', 'noopener'); }}
            >
              <Icon name="link" /> Open in {d.serviceKey ?? 'source'}
            </SirenButton>
          )}
        </Box>
      </Card>
    </ModalShell>
  );
}
