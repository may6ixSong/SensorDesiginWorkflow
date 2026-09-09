import { useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
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
import { queryKeys } from '@/api/queryKeys';
import { getCalypsoArtifact } from '@/api/calypsoClient';
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
 *
 * Calypso에 연동된 산출물이면(serviceKey==='calypso') 여기 뜨는 내용도 결국 그 산출물의
 * 데이터라, DeliverableDialog와 똑같이 Calypso 자체 ACL(view/edit, 개인·부서 단위)로
 * 열람 여부를 한 번 더 확인한다(사용자 요청 — "기본은 다 차단, 권한 있는 경우에만
 * 열리게"). SIREN이 보내주는 releasedVersion을 그냥 믿고 보여주면, 그 산출물에 대한
 * Calypso 쪽 view 권한이 없는 사람도(예: 그 부서 소속이 아님) 이 팝업으로는 볼 수
 * 있게 되는 구멍이 생긴다.
 */
export function IncomingDeliverableDialog({ d, onClose }: Props) {
  const { resolveUser } = useDirectory();
  const calypsoLinked = d?.serviceKey === 'calypso' && !!d?.externalArtifactId;
  const externalArtifactId = d?.externalArtifactId ?? '';
  const { isLoading: calypsoLoading, isError: calypsoError, error: calypsoErrorObj } = useQuery({
    queryKey: queryKeys.calypsoArtifact(externalArtifactId),
    queryFn: () => getCalypsoArtifact(externalArtifactId),
    enabled: calypsoLinked,
    retry: false,
  });
  const calypsoForbidden = (calypsoErrorObj as any)?.response?.status === 403;

  useEffect(() => {
    if (calypsoForbidden) {
      toast('You do not have view access to this artifact.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calypsoForbidden]);

  if (!d) return null;

  if (calypsoLinked && calypsoLoading) {
    return (
      <ModalShell open onClose={onClose} width={520} header={<Ey>Loading…</Ey>}>
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <CircularProgress size={24} />
        </Box>
      </ModalShell>
    );
  }
  // calypsoForbidden은 위 effect가 곧 onClose()로 닫는다 — 그 사이 빈 화면 대신 아무것도
  // 안 그린다. 그 외 에러(예: 링크가 stale)는 기존처럼 SIREN이 보낸 값으로 계속 보여준다.
  if (calypsoLinked && calypsoForbidden) return null;
  if (calypsoLinked && calypsoError) {
    return (
      <ModalShell open onClose={onClose} width={520} header={<Ey>Could not load</Ey>}>
        <Box sx={{ fontSize: 12.5, color: T.dm, padding: '10px 0' }}>
          Could not load the linked Calypso artifact. It may not exist, or the link is stale.
        </Box>
      </ModalShell>
    );
  }

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
