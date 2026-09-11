import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AccessGrant, ArtifactVersionDto, BlockDto, ProjectDetailDto, isMaskedArtifact } from '@/types/domain';
import { SlidePanel } from '@/components/common/SlidePanel';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey } from '@/components/common/Panel';
import { TabPanel, Tabs } from '@/components/common/Tabs';
import { Icon, IconName } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { AccessGrantEditor } from '@/components/dialogs/AccessGrantEditor';
import { fmtAt } from '@/lib/canvasModel';
import { FONT_MONO, R, T, TIER_COLOR, TNUM } from '@/theme/tokens';

type Tab = 'versions' | 'recipients';

/** 패널 머리 — 산출물 이름 한 줄. 부가 배지는 본문 상단에서 따로 그린다. */
function SlideHeader({ name }: { name: string }) {
  return (
    <>
      <Ey>Artifact</Ey>
      <Box sx={{ fontSize: 17, fontWeight: 700, mt: '2px' }}>{name}</Box>
    </>
  );
}

/**
 * 패널이 "내용 대신 상태"를 보여 줘야 할 때 쓰는 자리.
 *
 * 아이콘을 원형 우물(well) 안에 넣어 크게 세운다 — 예전처럼 본문 폰트 크기의 선 아이콘만
 * 덩그러니 두면 화면이 그냥 비어 보이고, 무엇이 문제인지도 읽히지 않는다.
 */
function EmptyState({
  icon, title, body, tone = 'neutral',
}: {
  icon: IconName; title: string; body: string; tone?: 'neutral' | 'locked';
}) {
  const locked = tone === 'locked';
  return (
    <Box
      sx={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 28px', textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 56, height: 56, borderRadius: '50%', mb: '14px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: locked ? T.dangerSoft : T.sf3,
          border: `1px solid ${locked ? T.dangerLine : T.ln}`,
          color: locked ? T.danger : T.dm2,
          '& svg': { width: 24, height: 24 },
        }}
      >
        <Icon name={icon} />
      </Box>
      <Box sx={{ fontSize: 14, fontWeight: 700, color: T.tx, mb: '6px' }}>{title}</Box>
      <Box sx={{ fontSize: 12.5, color: T.dm2, lineHeight: 1.65, maxWidth: 340 }}>{body}</Box>
    </Box>
  );
}

interface Props {
  block: BlockDto | null;
  /** 이 workflow의 Edit 권한 — recipient를 편집할 수 있는지의 기준이다. */
  own: boolean;
  project?: ProjectDetailDto;
  onClose: () => void;
  /** A Tier — block에 붙은 recipient를 교체한다. */
  onSaveBlockRecipients: (p: { editAccess: AccessGrant; viewAccess: AccessGrant }) => void;
  /** B/C/D — artifact의 edit/view를 교체한다. viewAccess가 곧 recipient다. */
  onSaveArtifactAccess: (p: { editAccess: AccessGrant; viewAccess: AccessGrant }) => void;
  saving?: boolean;
  onDelete?: () => void;
}

/**
 * 산출물 상세 — 오른쪽에서 열리는 슬라이드 패널.
 *
 * ★ **내부 콘텐츠는 이번 범위 밖이다(TODO T1).** 대규모 개편이 예정되어 있어, 지금은
 *   설계서가 요구한 세 가지만 반영한다(설계서 04장 §4.4):
 *     1) 권한에 따른 열람 차단 — 서버가 이미 판정해 보내므로 여기서는 그 결과를 그린다
 *     2) Recipient 탭
 *     3) published / not published 용어 통일
 *
 * ★ "권한 없음"과 "아직 publish된 버전이 없음"을 **절대 같은 화면으로 처리하지 않는다**
 *   (설계서 04장 §4.3). 전자는 패널이 잠긴 상태, 후자는 열린 패널 안의 빈 목록이다.
 */
export function ArtifactSlide({
  block, own, project, onClose, onSaveBlockRecipients, onSaveArtifactAccess, saving, onDelete,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('versions');

  if (!block) return null;
  const artifact = block.artifact;

  /* ── 열람 차단 ──
     서버가 권한을 판정해 masked로 내려보냈다는 뜻이다. A Tier라면 recipient가 아니거나
     그 서비스에서 view 권한이 없는 것이고, B/C/D라면 artifact 권한이 없는 것이다. */
  if (isMaskedArtifact(artifact)) {
    return (
      <SlidePanel open onClose={onClose} width="560px" header={<SlideHeader name={artifact.name} />}>
        <EmptyState
          icon="lock"
          tone="locked"
          title={t('artifact.noAccess')}
          body={artifact.tier === 'A'
            ? 'Tier A access is granted by the owning service and by this workflow’s recipient list.'
            : 'Ask the artifact owner to grant you view access.'}
        />
      </SlidePanel>
    );
  }

  /* ── 출처 미지정 ── 자리는 있으나 아직 아무것도 안 걸린 정상 빈 상태다. */
  if (!artifact) {
    return (
      <SlidePanel open onClose={onClose} width="560px" header={<SlideHeader name={block.name} />}>
        {/* TODO(T1): 여기에 산출물 매핑 UI가 들어간다. */}
        <EmptyState
          icon="unlinked"
          title="No source yet"
          body="This block holds a place on the canvas. Map it to an artifact to start tracking versions."
        />
      </SlidePanel>
    );
  }

  const tier = TIER_COLOR[artifact.tier];
  const isATier = artifact.tier === 'A';
  const published = artifact.versions.filter((v) => v.isPublished);
  const canEditRecipients = own;

  return (
    <SlidePanel
      open
      onClose={onClose}
      width="560px"
      header={<SlideHeader name={artifact.name} />}
      footer={own && onDelete && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SirenButton variant="ghost" onClick={onDelete} sx={{ color: T.danger, borderColor: T.dangerLine }}>
            <Icon name="trash" /> Remove from canvas
          </SirenButton>
        </Box>
      )}
    >
      {/* ── 머리 — tier / 망 / 상태 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '14px' }}>
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: tier.bg, color: tier.fg, fontSize: 11, fontWeight: 700,
            padding: '3px 8px', borderRadius: `${R.xs}px`, letterSpacing: '0.03em',
          }}
        >
          Tier {artifact.tier}
        </Box>
        {artifact.network === 'HPC' && (
          <Badge color={T.dm} bg={T.sf3} borderColor="transparent">HPC</Badge>
        )}
        {published.length ? (
          <Badge color={T.ok} bg={T.okSoft} borderColor={T.okLine}>{t('artifact.published')}</Badge>
        ) : (
          <Badge color={T.dm2} bg={T.sf2} borderColor={T.ln}>{t('artifact.notPublished')}</Badge>
        )}
        {artifact.serviceKey && (
          <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>
            {artifact.serviceKey}
            {artifact.externalArtifactId ? ` · ${artifact.externalArtifactId}` : ''}
          </Box>
        )}
      </Box>

      {/* Calypso 원본 — 실제 내용·업로드 화면은 SIREN 안(/artifacts/:id)에 있다. 예전 별도
          calypso/web(5174)은 이미 폐기됐으니 그쪽으로 새 탭을 열면 안 된다(사용자 지적).
          SirenButton은 component={motion.button}로 고정돼 있어 Link로 바꿔치기할 수
          없으므로, 그 primary variant 스타일을 그대로 옮겨 Link에 입힌다. */}
      {artifact.serviceKey === 'calypso' && artifact.externalArtifactId && (
        <Box
          component={Link}
          to={`/artifacts/${artifact.externalArtifactId}`}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: 12.5, fontWeight: 500, padding: '6px 11px', borderRadius: `${R.sm}px`,
            background: T.pr, color: '#fff', border: '1px solid transparent', boxShadow: T.shXs,
            textDecoration: 'none', mb: '14px',
            '&:hover': { background: T.prHover },
          }}
        >
          <Icon name="expand" /> Open in Artifact page
        </Box>
      )}

      {/* ── 탭 ── */}
      <Tabs
        tabs={[
          { key: 'versions' as Tab, label: 'Versions', badge: artifact.versions.length || undefined },
          { key: 'recipients' as Tab, label: t('artifact.recipients') },
        ]}
        value={tab}
        onChange={setTab}
        sx={{ mb: '14px' }}
      />

      <TabPanel tabKey={tab}>
        {tab === 'versions' && (
          <VersionsTab
            versions={artifact.versions}
            calypsoArtifactId={artifact.serviceKey === 'calypso' ? artifact.externalArtifactId : null}
          />
        )}

        {tab === 'recipients' && (
          <RecipientsTab
            block={block}
            isATier={isATier}
            canEdit={canEditRecipients}
            departmentOptions={project?.departments ?? []}
            onSaveBlockRecipients={onSaveBlockRecipients}
            onSaveArtifactAccess={onSaveArtifactAccess}
            saving={saving}
          />
        )}
      </TabPanel>
    </SlidePanel>
  );
}

/**
 * 버전 목록.
 *
 * ★ 권한이 없어서 안 보이는 것과 **아직 publish된 버전이 없는 것**은 완전히 다른 화면이다.
 *   여기 도달했다는 것은 이미 열람 권한이 있다는 뜻이므로, 비어 있으면 "아직 없음"이다.
 * ★ 미발행(working) 버전은 giver에게만 응답에 담겨 온다 — FE가 거르는 게 아니다.
 */
function VersionsTab({
  versions, calypsoArtifactId,
}: {
  versions: ArtifactVersionDto[];
  /** Calypso 산출물이면 값이 있다 — "Open"이 외부 viewUrl(예전 calypso/web, 폐기됨) 대신
   * SIREN 안의 /artifacts/:id로 가야 한다(사용자 지적). */
  calypsoArtifactId: string | null;
}) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();

  if (!versions.length) {
    return (
      <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
        {t('artifact.noPublishedVersion')}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {versions.map((v, i) => {
        const by = v.giverKnoxId ? resolveUser(v.giverKnoxId) : null;
        const at = v.publishedAt ?? v.observedAt ?? v.createdAt;
        return (
          <Card key={`${v.versionLabel}:${i}`} sx={{ padding: '11px 13px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, ...TNUM }}>
                {v.versionLabel}
              </Box>
              {/* "Working"은 가장 최신 버전(i===0, versions는 최신순)이 미발행일 때만 —
                  과거의 미발행 버전까지 전부 Working으로 보이면 "지금 작업 중인 게 여러
                  개"처럼 잘못 읽힌다(사용자 지적). versions는 artifacts.service.ts가
                  항상 새 항목을 배열 맨 앞에 꽂는 식(unshift와 동일)이라 0번이 최신이다. */}
              {v.isPublished ? (
                <Badge color={T.ok} bg={T.okSoft} borderColor={T.okLine}>{t('artifact.published')}</Badge>
              ) : i === 0 ? (
                <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>Working</Badge>
              ) : null}
              <Box sx={{ flex: 1 }} />
              <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{at ? fmtAt(at) : ''}</Box>
            </Box>

            {v.note && (
              <Box sx={{ fontSize: 12, color: T.tx2, mt: '6px', lineHeight: 1.55 }}>{v.note}</Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', mt: '8px' }}>
              {by && <UserAvatar user={by} size={19} />}
              <Box sx={{ fontSize: 11, color: T.dm2 }}>{by?.name ?? v.giverKnoxId ?? ''}</Box>
              <Box sx={{ flex: 1 }} />
              {v.hpcPath && (
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }} title={v.hpcPath}>
                  {v.hpcPath}
                </Box>
              )}
              {/* Calypso면 항상 SIREN 내부 artifact 페이지로 — v.viewUrl은 Calypso 백엔드의
                  PUBLIC_BASE_URL(폐기된 calypso/web, 5174)로 만들어져 그쪽을 가리키므로
                  쓰지 않는다. 그 외(계약 맺은 진짜 외부 서비스)만 viewUrl을 그대로 연다. */}
              {calypsoArtifactId ? (
                <Box
                  component={Link}
                  to={`/artifacts/${calypsoArtifactId}`}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: 11, color: T.pr, textDecoration: 'none', fontWeight: 600,
                  }}
                >
                  <Icon name="link" /> Open
                </Box>
              ) : v.viewUrl && (
                <Box
                  component="a"
                  href={v.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: 11, color: T.pr, textDecoration: 'none', fontWeight: 600,
                  }}
                >
                  <Icon name="link" /> Open
                </Box>
              )}
            </Box>
          </Card>
        );
      })}
      {/* TODO(T1): 버전 트리 위에 release 마커(v{n})를 얹는다(설계서 05장 §7.3). */}
    </Box>
  );
}

/**
 * 수신 대상 (설계서 04장 §5).
 *
 * ★ **A Tier**는 recipient가 그 workflow의 block에 붙는다 — 같은 artifact라도 workflow마다
 *   다를 수 있기 때문이다. 그리고 이 목록은 알림 대상이자 **slide 열람의 첫 게이트**다.
 * ★ **B/C/D**는 artifact의 viewAccess가 곧 recipient이고, 그 값은 artifact 단위로 중앙
 *   관리되어 그 산출물을 참조하는 **모든 workflow에 동일하게** 적용된다.
 * ★ View 권한자에게는 **읽기 전용**으로 노출한다 — 누가 받는지는 볼 수 있어야 한다.
 */
function RecipientsTab({
  block, isATier, canEdit, departmentOptions, onSaveBlockRecipients, onSaveArtifactAccess, saving,
}: {
  block: BlockDto;
  isATier: boolean;
  canEdit: boolean;
  departmentOptions: string[];
  onSaveBlockRecipients: Props['onSaveBlockRecipients'];
  onSaveArtifactAccess: Props['onSaveArtifactAccess'];
  saving?: boolean;
}) {
  const { t } = useTranslation();
  const artifact = block.artifact && !isMaskedArtifact(block.artifact) ? block.artifact : null;

  const initialEdit = isATier
    ? (block.recipients?.editAccess ?? { departments: [], users: [] })
    : (artifact?.editAccess ?? { departments: [], users: [] });
  const initialView = isATier
    ? (block.recipients?.viewAccess ?? { departments: [], users: [] })
    : (artifact?.viewAccess ?? { departments: [], users: [] });

  const [editAccess, setEditAccess] = useState<AccessGrant>(initialEdit);
  const [viewAccess, setViewAccess] = useState<AccessGrant>(initialView);

  const dirty = useMemo(
    () =>
      JSON.stringify(editAccess) !== JSON.stringify(initialEdit) ||
      JSON.stringify(viewAccess) !== JSON.stringify(initialView),
    [editAccess, viewAccess, initialEdit, initialView],
  );

  const save = () =>
    isATier
      ? onSaveBlockRecipients({ editAccess, viewAccess })
      : onSaveArtifactAccess({ editAccess, viewAccess });

  return (
    <>
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          background: T.infoSoft, border: `1px solid ${T.infoLine}`, color: T.info,
          borderRadius: `${R.sm}px`, padding: '9px 12px', fontSize: 12, lineHeight: 1.55, mb: '14px',
        }}
      >
        <Box sx={{ mt: '1px', flexShrink: 0 }}><Icon name="info" /></Box>
        <Box>
          {isATier
            ? 'Recipients are set per workflow for Tier A. Being a recipient also grants access to this slide — the owning service still decides what is actually visible.'
            : 'View access is the recipient list. It is shared by every workflow that uses this artifact.'}
        </Box>
      </Box>

      {!canEdit && (
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '10px' }}>{t('artifact.recipientsReadOnly')}</Box>
      )}

      <Card sx={{ mb: '12px' }}>
        <Ey sx={{ mb: '10px' }}>{isATier ? 'Edit recipients' : 'Edit access'}</Ey>
        <AccessGrantEditor
          value={editAccess}
          onChange={setEditAccess}
          departmentOptions={departmentOptions}
          readOnly={!canEdit}
        />
      </Card>

      <Card>
        <Ey sx={{ mb: '10px' }}>{isATier ? 'View recipients' : 'View access · recipients'}</Ey>
        <AccessGrantEditor
          value={viewAccess}
          onChange={setViewAccess}
          departmentOptions={departmentOptions}
          readOnly={!canEdit}
        />
      </Card>

      {canEdit && (
        <Box sx={{ mt: '14px' }}>
          <SirenButton variant="primary" onClick={save} disabled={saving || !dirty}>
            <Icon name="check" /> {saving ? 'Saving…' : 'Save'}
          </SirenButton>
        </Box>
      )}
    </>
  );
}
