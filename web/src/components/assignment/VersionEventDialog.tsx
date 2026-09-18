import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { Location } from './Location';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { VersionEventDto } from '@/types/domain';
import { FONT_MONO, T } from '@/theme/tokens';

/**
 * artifact 버전 event 한 건 — 달력에서 클릭했을 때 여는 가벼운 다이얼로그.
 *
 * ★ **추가 조회를 하지 않는다.** 달력 응답(`VersionEventDto`)에 이미 담겨 온 필드만
 *   보여준다 — 그 서비스에 라이브로 권한을 물어보는 판정(01장 §4.2)은 여기서 하지 않으므로,
 *   세세한 버전 이력이나 파일 내용까지는 보여주지 않는다. 더 깊이 보려면 그 workflow의
 *   캔버스에서 연다.
 */
export function VersionEventDialog({ event, onClose }: { event: VersionEventDto; onClose: () => void }) {
  const { resolveUser } = useDirectory();
  const giver = event.giverKnoxId ? resolveUser(event.giverKnoxId) : null;

  return (
    <ModalShell
      open
      onClose={onClose}
      width={560}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{event.artifactName}</Box>
          <NetworkTag network={event.network} />
          <Badge
            color={event.isPublished ? T.pr : T.dm}
            bg={event.isPublished ? T.prSoft : T.sf3}
            borderColor={event.isPublished ? T.prLine : T.ln2}
          >
            {event.isPublished ? 'PUBLISHED' : 'WORKING'}
          </Badge>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ fontSize: 11, color: T.dm2 }}>{event.projectCode}</Box>
        </Box>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px', flexWrap: 'wrap' }}>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700, color: T.pr }}>
          {event.versionLabel}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(event.occurredAt)}</Box>
      </Box>

      {giver && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mb: '14px' }}>
          <UserAvatar user={giver} size={20} />
          <Box sx={{ fontSize: 11.5, color: T.dm }}>{giver.name}</Box>
        </Box>
      )}

      <Location viewUrl={event.viewUrl} hpcPath={event.hpcPath} />

      {event.placements.length > 0 && (
        <Box sx={{ mt: '16px' }}>
          <Ey sx={{ mb: '6px' }}>Placed in</Ey>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {event.placements.map((p) => (
              <Box key={p.blockId} sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 11.5 }}>
                <Box sx={{ fontWeight: 600 }}>{p.workflowName}</Box>
                <Box sx={{ fontSize: 10.5, color: T.dm2 }}>{canonicalDepartmentLabel(p.department)}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </ModalShell>
  );
}
