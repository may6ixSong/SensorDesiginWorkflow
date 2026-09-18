import { Box } from '@mui/material';
import { ModalShell } from '@/components/common/ModalShell';
import { Badge } from '@/components/common/SirenButton';
import { Ey } from '@/components/common/Panel';
import { UserAvatar } from '@/components/common/Avatar';
import { NetworkTag } from '@/components/artifact/ArtifactChips';
import { Location } from './Location';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useRelease } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyReleaseRowDto, ReleaseItemDto } from '@/types/domain';
import { FONT_MONO, T, TIER_COLOR, TIER_LABEL } from '@/theme/tokens';

/**
 * "이 release로 무엇이 어떻게 오갔는가" 한 장 (설계서 09장 §4).
 *
 * 목록 행에는 버전 라벨이 아예 실려 있지 않다 — 산출물별 열람 권한은 그 서비스에 라이브로
 * 물어봐야 정해지기 때문이다(01장 §4.2). 그 판정은 이 다이얼로그가 여는 `GET /releases/:id`
 * 한 건에 대해서만 돌고, 권한이 없는 행은 서버가 버전·링크·경로를 **비워서** 보낸다
 * (`masked: true`) — FE가 숨기는 게 아니라 응답에서 빠진다(01장 §5).
 *
 * 마스킹은 **열람 시점 기준**이라, 같은 release를 나중에 다시 열면 그때의 권한으로 다시
 * 판정된다(05장 §5).
 */
export function ReleaseDetailDialog({
  row, onClose,
}: {
  row: MyReleaseRowDto;
  onClose: () => void;
}) {
  const { resolveUser } = useDirectory();
  const { data, isLoading, isError } = useRelease(row.id);
  const releasedBy = resolveUser(row.releasedBy);

  return (
    <ModalShell
      open
      onClose={onClose}
      width={980}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: T.pr }}>
            {row.label}
          </Box>
          <Box sx={{ fontSize: 14, fontWeight: 700 }}>{row.workflowAt.name}</Box>
          <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
            {canonicalDepartmentLabel(row.workflowAt.department)}
          </Badge>
          <DirectionBadges row={row} />
          <Box sx={{ flex: 1 }} />
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>
            {row.projectCode} · {row.projectName}
          </Box>
        </Box>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: '14px' }}>
        <UserAvatar user={releasedBy} size={22} />
        <Box sx={{ fontSize: 12.5, fontWeight: 600 }}>{releasedBy?.name ?? row.releasedBy}</Box>
        <Box sx={{ fontSize: 11.5, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(row.releasedAt)}</Box>
      </Box>

      {/* release note — release 전체에 하나뿐이고 필수 입력이다(05장 §4.3). */}
      <Box sx={{ mb: '18px' }}>
        <Ey sx={{ mb: '6px' }}>Release note</Ey>
        <Box
          sx={{
            border: `1px solid ${T.ln}`, borderRadius: '10px', background: T.sf,
            padding: '11px 13px', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            color: row.note ? T.tx : T.dm2,
          }}
        >
          {row.note || 'No note'}
        </Box>
      </Box>

      <Ey sx={{ mb: '7px' }}>Artifacts in this release</Ey>

      {isError ? (
        <Box
          sx={{
            border: `1px solid ${T.dangerLine}`, background: T.dangerSoft, color: T.danger,
            borderRadius: '10px', padding: '16px 18px', fontSize: 12.5,
          }}
        >
          Could not load this release.
        </Box>
      ) : isLoading || !data ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                height: 54, borderRadius: '10px', border: `1px solid ${T.ln}`, background: T.sf,
                animation: 'sirenPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.items.map((item) => (
            <ItemCard key={item.blockId} item={item} />
          ))}
          {!data.items.length && (
            <Box sx={{ fontSize: 12, color: T.dm2, padding: '18px 0', textAlign: 'center' }}>
              This release carried no mapped artifacts.
            </Box>
          )}
        </Box>
      )}
    </ModalShell>
  );
}

/** 같은 release가 나에게 "받은 것"이면서 "낸 것"일 수 있다 — 내 부서가 내 부서에 전달한 경우. */
function DirectionBadges({ row }: { row: MyReleaseRowDto }) {
  return (
    <>
      {row.received && (
        <Badge color={T.recv} bg={T.recvSoft} borderColor={T.recv}>RECEIVED</Badge>
      )}
      {row.published && (
        <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>PUBLISHED</Badge>
      )}
    </>
  );
}

/**
 * 한 산출물이 그 release에서 어떤 버전으로, 어디에서 와서, 누구에게 갔는지.
 *
 * ★ `Not published`와 `권한 없음`은 **절대 같은 화면을 쓰지 않는다**(04장 §4.3) —
 *   전자는 "아직 확정된 버전이 없다", 후자는 "있는지 없는지도 알려줄 수 없다"이고,
 *   둘을 같게 그리면 받는 쪽이 사실을 오해한다.
 */
function ItemCard({ item }: { item: ReleaseItemDto }) {
  const tier = TIER_COLOR[item.tier];
  return (
    <Box
      sx={{
        border: `1px solid ${item.changed ? T.changedLine : T.ln}`,
        background: item.changed ? T.changed : T.sf,
        borderRadius: '10px', padding: '11px 13px',
        display: 'grid',
        gridTemplateColumns: 'minmax(210px, 1.4fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(140px, 1fr)',
        gap: '12px',
        alignItems: 'start',
        '@media (max-width: 900px)': { gridTemplateColumns: '1fr' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '3px' }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
            {item.artifactName}
          </Box>
          <NetworkTag network={item.network} />
          {item.firstTime && (
            <Badge color={T.info} bg={T.infoSoft} borderColor={T.infoLine}>FIRST</Badge>
          )}
        </Box>
        <Box sx={{ fontSize: 10.5, color: tier.fg, background: tier.bg, display: 'inline-block', padding: '1px 5px', borderRadius: '5px', fontWeight: 700 }}>
          {TIER_LABEL[item.tier]}
        </Box>
        {item.phaseName && (
          <Box sx={{ fontSize: 11, color: T.dm2, mt: '4px' }}>Phase · {item.phaseName}</Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Published version</Ey>
        {item.masked ? (
          <Box sx={{ fontSize: 11.5, color: T.dm2, fontStyle: 'italic' }}>
            No access — hidden
          </Box>
        ) : item.published ? (
          <>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700 }}>
              {item.published.versionLabel}
            </Box>
            {item.published.publishedAt && (
              <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>
                {fmtAt(item.published.publishedAt)}
              </Box>
            )}
            <Location viewUrl={item.published.viewUrl} hpcPath={item.published.hpcPath} />
          </>
        ) : (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>Not published</Box>
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Source</Ey>
        {!item.sources.length ? (
          <Box sx={{ fontSize: 11.5, color: T.dm2 }}>—</Box>
        ) : (
          item.sources.map((s) => (
            <Box key={s.blockId} sx={{ mb: '5px' }}>
              <Box sx={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{s.artifactName}</Box>
              <Box
                sx={{
                  fontFamily: FONT_MONO, fontSize: 11,
                  color: s.selected ? T.tx2 : T.dm2,
                  fontStyle: s.selected ? 'normal' : 'italic',
                }}
              >
                {item.masked ? 'hidden' : s.selected ? s.selected.versionLabel : 'not delivered yet'}
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Ey sx={{ mb: '3px' }}>Recipients</Ey>
        <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {item.recipients.departments.map((d) => (
            <Badge key={d} color={T.dm} bg={T.sf3} borderColor={T.ln}>
              {canonicalDepartmentLabel(d)}
            </Badge>
          ))}
          {item.recipients.users.length > 0 && (
            <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
              +{item.recipients.users.length} user{item.recipients.users.length > 1 ? 's' : ''}
            </Badge>
          )}
          {!item.recipients.departments.length && !item.recipients.users.length && (
            <Box sx={{ fontSize: 11.5, color: T.dm2 }}>None</Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
