import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AccessGrant, ArtifactHtmlView, ArtifactVersionDto, BlockDto, ProjectDetailDto, ReleaseDto, WorkflowPhase,
  isMaskedArtifact,
} from '@/types/domain';
import { SlidePanel } from '@/components/common/SlidePanel';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey, SelectInput, TextArea } from '@/components/common/Panel';
import { TabPanel, Tabs } from '@/components/common/Tabs';
import { Icon, IconName } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { NewArtifactSourceInput, useHtmlView, useLiveVersions } from '@/api/hooks/useBlocks';
import { useComments, useCreateComment } from '@/api/hooks/useComments';
import { CommentDto } from '@/types/domain';
import { AccessGrantEditor } from '@/components/dialogs/AccessGrantEditor';
import { ChangeArtifactDialog } from '@/components/dialogs/ChangeArtifactDialog';
import { CalypsoInlinePanel } from '@/components/artifact/CalypsoInlinePanel';
import { HtmlViewPanel } from '@/components/artifact/HtmlViewPanel';
import { fmtAt, isOrphanPhase } from '@/lib/canvasModel';
import { shortDate } from '@/lib/schedule';
import { releaseBadgeMap } from '@/lib/releaseBadge';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, R, T, TIER_COLOR, TIER_LABEL, TNUM } from '@/theme/tokens';

/** Overview에서 html preview를 함께 그릴 때 왼쪽(B) 칸의 실제 폭 — 900px 패널 - 좌우 여백
 * - 두 칸 사이 gap을 뺀 2/3. CalypsoInlinePanel의 왼쪽 칸과 같은 폭으로 맞춘다. */
const HTML_VIEW_MAX_WIDTH = 560;

type Tab = 'overview' | 'recipients' | 'comments';

/** Published/Working 배지가 기본 Badge 크기(8px)로는 너무 작다는 지적(사용자) — 여기서만 키운다. */
const STATUS_BADGE_SX = { fontSize: 10.5, padding: '2px 7px', fontWeight: 700 };

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
  /** ChangeArtifactDialog의 File Artifacts 피커, 그리고 B Tier 인라인 패널이 Calypso
   * 헤더에 실어 보낼 값. */
  myDepartments?: string[];
  /** 이 workflow의 phase 목록 — Overview 탭의 Phase 카드(설계서 04장 §4.4 이전 표기 복원)에 쓴다. */
  phases?: WorkflowPhase[];
  onClose: () => void;
  /** block에 붙은 recipient를 교체한다 — A/B/C 전부 공통이다. */
  onSaveRecipients: (p: AccessGrant) => void;
  saving?: boolean;
  onDelete?: () => void;
  /** 산출물 매핑/재매핑(설계서 04장 §6) — Block과 Artifact가 분리돼 있어 언제든 바꿀 수 있다. */
  onChangeArtifact?: (newArtifact: NewArtifactSourceInput) => void;
  changingArtifact?: boolean;
  /** 이 workflow의 release 이력 — 버전 트리 위 release 마커(설계서 05장 §7.3)에 쓴다. */
  releases?: ReleaseDto[];
  /** release 마커를 클릭했을 때 — 그 release의 상세를 연다. */
  onOpenRelease?: (releaseId: string) => void;
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
  block, own, project, myDepartments, phases, onClose, onSaveRecipients, saving, onDelete,
  onChangeArtifact, changingArtifact, releases, onOpenRelease,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');
  const [changeOpen, setChangeOpen] = useState(false);
  /** 사용자가 Version history에서 다른 (hasHtmlView인) 버전을 직접 골랐으면 그 라벨 —
   * 안 골랐으면 undefined이고, 그러면 latest 버전을 요청한다(사용자 요청: 최초 open시
   * latest로 html 요청). */
  const [selectedVersionLabel, setSelectedVersionLabel] = useState<string | undefined>(undefined);

  /* ── A Tier 라이브 버전 조회 (설계서 04장 §19.5/§19.6 복원) ──
     Calypso 제외 Hub 등록 서비스에 연동된 A Tier만 대상이다 — 이런 산출물의
     `artifact.versions`(캔버스 목록에 실려 온 값)는 매핑 당시 스냅샷일 뿐이라 믿을 수
     없다. block이 아직 없거나(early return 전) masked/미매핑이어도 훅은 早期 return 전에
     불러야 하므로(Hooks 규칙) 안전하게 optional chaining으로 판정한다. */
  const artifactForHook = block?.artifact;
  const safeArtifactForHook = artifactForHook && !isMaskedArtifact(artifactForHook) ? artifactForHook : null;
  const isHubLive =
    !!safeArtifactForHook &&
    safeArtifactForHook.tier === 'A' &&
    !!safeArtifactForHook.serviceKey &&
    safeArtifactForHook.serviceKey !== 'calypso' &&
    !!safeArtifactForHook.externalArtifactId;
  const live = useLiveVersions(block?.workflowId, block?.id, isHubLive);

  /* ── html preview (설계서 04장 §19 확장) ──
     latest(또는 사용자가 고른) 버전에 hasHtmlView가 있을 때만 켠다 — 이것도 Hooks 규칙 때문에
     early return 전에 안전한 optional chaining으로 판정해야 한다. */
  const versionsForHtmlHook = isHubLive ? (live.data ?? []) : (safeArtifactForHook?.versions ?? []);
  const requestedVersionLabel = selectedVersionLabel ?? versionsForHtmlHook[0]?.versionLabel;
  const requestedVersion = versionsForHtmlHook.find((v) => v.versionLabel === requestedVersionLabel);
  const htmlView = useHtmlView(block?.workflowId, block?.id, requestedVersionLabel, !!requestedVersion?.hasHtmlView);

  /** 탭 배지 숫자용 — CommentsTab이 같은 queryKey로 다시 불러도 캐시를 재사용할 뿐 추가
   * 네트워크 요청은 없다. */
  const comments = useComments(block?.workflowId, block?.id);
  
  useEffect(() => {
    setSelectedVersionLabel(undefined);
  }, [block?.id]);

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
            ? 'Access to this artifact is granted by the owning service and by this workflow’s recipient list.'
            : 'Ask the artifact owner to grant you view access.'}
        />
      </SlidePanel>
    );
  }

  /* ── 출처 미지정 ── 자리는 있으나 아직 아무것도 안 걸린 정상 빈 상태다. */
  if (!artifact) {
    return (
      <SlidePanel open onClose={onClose} width="560px" header={<SlideHeader name={block.name} />}>
        <EmptyState
          icon="unlinked"
          title="No source yet"
          body="This block holds a place on the canvas. Map it to an artifact to start tracking versions."
        />
        {own && onChangeArtifact && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: '-16px' }}>
            <SirenButton variant="primary" onClick={() => setChangeOpen(true)}>
              <Icon name="link" /> Map to artifact
            </SirenButton>
          </Box>
        )}
        {changeOpen && onChangeArtifact && (
          <ChangeArtifactDialog
            block={block}
            projectId={project?._id}
            projectCode={project?.code}
            projectRevision={project?.revision}
            myDepartments={myDepartments ?? []}
            departmentOptions={project?.departments ?? []}
            submitting={changingArtifact}
            onClose={() => setChangeOpen(false)}
            onSave={(na) => { onChangeArtifact(na); setChangeOpen(false); }}
          />
        )}
      </SlidePanel>
    );
  }

  const tier = TIER_COLOR[artifact.tier];
  // Hub 라이브 대상이면 artifact.versions(스냅샷) 대신 방금 그 서비스에 물어본 값을 쓴다.
  const effectiveVersions = isHubLive ? (live.data ?? []) : artifact.versions;
  const published = effectiveVersions.filter((v) => v.isPublished);
  const canEditRecipients = own;
  // File Artifacts(B Tier, Calypso)는 Overview에 독립 Artifact page와 같은 2단 레이아웃
  // (본문 2 : 버전 트리 1)을 그려야 해서, 그 폭을 담을 수 있게 패널 자체를 넓힌다
  // (사용자 요청) — 다른 tier/tab은 기존 560px 그대로 둔다.
  const isCalypsoB = artifact.tier === 'B' && artifact.serviceKey === 'calypso' && !!artifact.externalArtifactId;
  // A/C Tier의 html preview — B Tier의 upload/download 자리를 이걸로 대신한다(사용자 요청).
  // latest 버전에 preview가 없으면(hasHtmlView:false) 이전처럼 아무것도 안 그린다 — 그래서
  // 이 gate는 "지금 요청 중인 버전"이 아니라 **항상 맨 위(latest) 버전** 기준이다.
  const showHtmlPanel = !isCalypsoB && !!effectiveVersions[0]?.hasHtmlView;
  const useWideLayout = isCalypsoB || showHtmlPanel;

  return (
    <SlidePanel
      open
      onClose={onClose}
      width={useWideLayout ? '900px' : '560px'}
      header={<SlideHeader name={artifact.name} />}
      footer={own && onDelete && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SirenButton variant="ghost" onClick={onDelete} sx={{ color: T.danger, borderColor: T.dangerLine }}>
            <Icon name="trash" /> Remove from canvas
          </SirenButton>
        </Box>
      )}
    >
      {/* ── 머리 — 출처 / 망 / 상태 ──
          Tier 글자(A/B/C)는 절대 노출하지 않는다(사용자 지적) — "새 Artifact 추가"
          다이얼로그와 같은 이름(TIER_LABEL)으로만 보여준다. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '14px' }}>
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: tier.bg, color: tier.fg, fontSize: 11, fontWeight: 700,
            padding: '3px 8px', borderRadius: `${R.xs}px`, letterSpacing: '0.03em',
          }}
        >
          {TIER_LABEL[artifact.tier]}
        </Box>
        {artifact.network === 'HPC' && (
          <Badge color={T.dm} bg={T.sf3} borderColor="transparent">HPC</Badge>
        )}
        {published.length ? (
          <Badge color={T.ok} bg={T.okSoft} borderColor={T.okLine} sx={STATUS_BADGE_SX}>{t('artifact.published')}</Badge>
        ) : (
          <Badge color={T.dm2} bg={T.sf2} borderColor={T.ln} sx={STATUS_BADGE_SX}>{t('artifact.notPublished')}</Badge>
        )}
        {artifact.serviceKey && (
          <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>
            {artifact.serviceKey}
            {artifact.externalArtifactId ? ` · ${artifact.externalArtifactId}` : ''}
          </Box>
        )}
        {own && onChangeArtifact && (
          <>
            <Box sx={{ flex: 1 }} />
            <SirenButton variant="ghost" onClick={() => setChangeOpen(true)} sx={{ fontSize: 11.5 }}>
              <Icon name="link" size={12} /> Change source
            </SirenButton>
          </>
        )}
      </Box>

      {changeOpen && onChangeArtifact && (
        <ChangeArtifactDialog
          block={block}
          projectId={project?._id}
          projectCode={project?.code}
          projectRevision={project?.revision}
          myDepartments={myDepartments ?? []}
          departmentOptions={project?.departments ?? []}
          submitting={changingArtifact}
          onClose={() => setChangeOpen(false)}
          onSave={(na) => { onChangeArtifact(na); setChangeOpen(false); }}
        />
      )}

      {/* Calypso 원본 — 실제 내용·업로드 화면은 SIREN 안(/artifacts/:id)에 있다. 예전 별도
          calypso/web(5174)은 이미 폐기됐으니 그쪽으로 새 탭을 열면 안 된다(사용자 지적).
          SirenButton은 component={motion.button}로 고정돼 있어 Link로 바꿔치기할 수
          없으므로, 그 primary variant 스타일을 그대로 옮겨 Link에 입힌다. */}
      {artifact.serviceKey === 'calypso' && artifact.externalArtifactId && project && (
        <Box
          component={Link}
          to={`/projects/${project._id}/artifacts/${artifact.externalArtifactId}`}
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
          { key: 'overview' as Tab, label: 'Overview' },
          { key: 'recipients' as Tab, label: t('artifact.recipients') },
          { key: 'comments' as Tab, label: 'Comments', badge: comments.data?.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
        sx={{ mb: '14px' }}
      />

      <TabPanel tabKey={tab}>
        {tab === 'overview' && (
          <OverviewTab
            block={block}
            phases={phases ?? []}
            versions={effectiveVersions}
            isCalypsoB={isCalypsoB}
            showHtmlPanel={showHtmlPanel}
            htmlViewData={htmlView.data}
            htmlViewLoading={htmlView.isLoading}
            selectedVersionLabel={requestedVersionLabel}
            onSelectVersion={(v) => setSelectedVersionLabel(v.versionLabel)}
            calypsoArtifactId={artifact.serviceKey === 'calypso' ? artifact.externalArtifactId : null}
            projectId={project?._id}
            blockId={block.id}
            releases={releases ?? []}
            onOpenRelease={onOpenRelease}
            isLive={isHubLive}
            liveLoading={isHubLive && live.isLoading}
          />
        )}

        {tab === 'recipients' && (
          <RecipientsTab
            block={block}
            canEdit={canEditRecipients}
            departmentOptions={project?.departments ?? []}
            onSaveRecipients={onSaveRecipients}
            saving={saving}
          />
        )}

        {tab === 'comments' && <CommentsTab block={block} versions={effectiveVersions} />}
      </TabPanel>
    </SlidePanel>
  );
}

/**
 * Overview — 위쪽 배지 줄(tier/발행 상태/service id/Change source, 지금 그대로) 아래로,
 * 이 workflow의 phase와 버전 트리를 보여준다(사용자 요청 — 개편 전 slide 형태 복원).
 *
 * ★ 권한이 없어서 안 보이는 것과 **아직 publish된 버전이 없는 것**은 완전히 다른 화면이다.
 *   여기 도달했다는 것은 이미 열람 권한이 있다는 뜻이므로, 비어 있으면 "아직 없음"이다.
 * ★ 미발행(working) 버전은 giver에게만 응답에 담겨 온다 — FE가 거르는 게 아니다.
 * ★ File Artifacts(B Tier, Calypso)는 이 generic 버전 목록 대신 CalypsoInlinePanel을
 *   그린다 — SIREN 쪽 artifact.versions는 Calypso 산출물에 대해서는 채워지지 않아서
 *   (라이브 조회 대상이 아니다) 늘 비어 있고, 실제 파일·버전은 Calypso 쪽에 있다.
 */
function OverviewTab({
  block, phases, versions, isCalypsoB, showHtmlPanel, htmlViewData, htmlViewLoading,
  selectedVersionLabel, onSelectVersion, calypsoArtifactId, projectId, blockId, releases, onOpenRelease, isLive, liveLoading,
}: {
  block: BlockDto;
  phases: WorkflowPhase[];
  versions: ArtifactVersionDto[];
  isCalypsoB: boolean;
  /** A/C Tier — latest(또는 지금 고른) 버전에 html preview가 있다. B Tier의
   * upload/download 자리를 대신해서 왼쪽에 그 preview를, 오른쪽에 Version history를 그린다. */
  showHtmlPanel: boolean;
  htmlViewData: ArtifactHtmlView | null | undefined;
  htmlViewLoading: boolean;
  selectedVersionLabel: string | undefined;
  onSelectVersion: (v: ArtifactVersionDto) => void;
  /** Calypso 산출물이면 값이 있다 — "Open"이 외부 viewUrl(예전 calypso/web, 폐기됨) 대신
   * SIREN 안의 /projects/:projectId/artifacts/:id로 가야 한다(사용자 지적). */
  calypsoArtifactId: string | null;
  /** SIREN project id — Calypso 프록시가 department를 계산하는 데 필요하다(설계서 07장 §2). */
  projectId: string | undefined;
  blockId: string;
  releases: ReleaseDto[];
  onOpenRelease?: (releaseId: string) => void;
  /** Calypso 제외 Hub 등록 서비스에 연동된 A Tier — 이 목록이 그 서비스에 방금 물어본
   * 라이브 응답이라는 뜻이다(설계서 04장 §19.5/§19.6). */
  isLive?: boolean;
  liveLoading?: boolean;
}) {
  const phase = phases.find((p) => p.id === block.phaseId);
  const orphan = isOrphanPhase(phases, block.phaseId);

  return (
    <>
      <PhaseCard phase={phase} orphan={orphan} />

      {isCalypsoB && calypsoArtifactId && projectId ? (
        <CalypsoInlinePanel
          artifactId={calypsoArtifactId}
          projectId={projectId}
          blockId={blockId}
          releases={releases}
          onOpenRelease={onOpenRelease}
        />
      ) : showHtmlPanel ? (
        // B(본문 — html preview) : A(버전 트리) = 2 : 1 — Calypso 인라인 패널과 같은
        // 자리 배치를 쓴다(사용자 요청).
        <Box sx={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 2, minWidth: 0 }}>
            <HtmlViewPanel data={htmlViewData} loading={htmlViewLoading} maxWidth={HTML_VIEW_MAX_WIDTH} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey sx={{ mb: '10px' }}>Version history</Ey>
            <VersionList
              versions={versions}
              calypsoArtifactId={calypsoArtifactId}
              projectId={projectId}
              blockId={blockId}
              releases={releases}
              onOpenRelease={onOpenRelease}
              isLive={isLive}
              liveLoading={liveLoading}
              selectedVersionLabel={selectedVersionLabel}
              onSelectVersion={onSelectVersion}
            />
          </Box>
        </Box>
      ) : (
        <VersionList
          versions={versions}
          calypsoArtifactId={calypsoArtifactId}
          projectId={projectId}
          blockId={blockId}
          releases={releases}
          onOpenRelease={onOpenRelease}
          isLive={isLive}
          liveLoading={liveLoading}
        />
      )}
    </>
  );
}

/** Phase 카드 — 개편 전 산출물 상세 머리에 있던 "이 산출물이 어느 phase에 있는지"를
 * Overview 본문으로 옮겨 복원한다. 지금 모델에서 block은 phase 하나에만 걸린다. */
function PhaseCard({ phase, orphan }: { phase: WorkflowPhase | undefined; orphan: boolean }) {
  return (
    <Card sx={{ mb: '12px' }}>
      <Ey sx={{ mb: '8px' }}>Phase</Ey>
      {orphan && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.danger,
            background: T.dangerSoft, border: `1px solid ${T.dangerLine}`, borderRadius: '8px',
            padding: '8px 10px', mb: '8px', lineHeight: 1.6,
          }}
        >
          <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
          The phase this artifact was on no longer exists in this workflow's schedule.
        </Box>
      )}
      {phase ? (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 13, fontWeight: 600 }}>{phase.name}</Box>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.dm2, ...TNUM }}>
            {shortDate(phase.start)} → {shortDate(phase.end)}
          </Box>
        </Box>
      ) : (
        <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No release schedule</Box>
      )}
    </Card>
  );
}

/**
 * 버전 목록 — 개편 전 3D perspective 카드 스타일(설계서 이전 slide 형태)로 복원하되,
 * 각 카드 안의 데이터(발행/저장 user·날짜, published 여부, 이 workflow에서의 release 여부)는
 * 지금 그대로 유지한다(사용자 요청).
 */
function VersionList({
  versions, calypsoArtifactId, projectId, blockId, releases, onOpenRelease, isLive, liveLoading,
  selectedVersionLabel, onSelectVersion,
}: {
  versions: ArtifactVersionDto[];
  calypsoArtifactId: string | null;
  projectId: string | undefined;
  blockId: string;
  releases: ReleaseDto[];
  onOpenRelease?: (releaseId: string) => void;
  isLive?: boolean;
  liveLoading?: boolean;
  /** html preview가 있는 버전(v.hasHtmlView)만 클릭 가능/하이라이트 대상이 된다(사용자
   * 요청) — 없는 버전은 지금처럼 클릭 이벤트도, 하이라이트도 없다. 둘 다 없으면(기본 단일
   * 칸 레이아웃) 이 기능 자체가 꺼진다. */
  selectedVersionLabel?: string;
  onSelectVersion?: (v: ArtifactVersionDto) => void;
}) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();

  const releasesByVersion = useMemo(() => releaseBadgeMap(releases, blockId), [releases, blockId]);

  if (liveLoading) {
    return (
      <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
        Checking the live version with the owning service…
      </Box>
    );
  }

  if (!versions.length) {
    return (
      <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
        {t('artifact.noPublishedVersion')}
      </Box>
    );
  }

  return (
    <Box sx={{ perspective: '1000px' }}>
      {isLive && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: 11, color: T.dm2, mb: '8px' }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
          Live from the owning service
        </Box>
      )}
      {versions.map((v, i) => {
        const by = v.giverKnoxId ? resolveUser(v.giverKnoxId) : null;
        const at = v.publishedAt ?? v.observedAt ?? v.createdAt;
        const relBadge = releasesByVersion.get(v.versionLabel);
        // html preview가 있는 버전만 클릭 가능/하이라이트 대상 — 없는 버전은 지금처럼
        // 아무 상호작용도 없다(사용자 요청).
        const clickable = !!onSelectVersion && v.hasHtmlView;
        const selected = clickable && v.versionLabel === selectedVersionLabel;
        return (
          <Card
            key={`${v.versionLabel}:${i}`}
            onClick={clickable ? () => onSelectVersion(v) : undefined}
            sx={{
              padding: '11px 13px', mb: '8px', transformStyle: 'preserve-3d',
              transition: 'transform .2s, box-shadow .2s, background .15s, border-color .15s',
              ...(clickable && { cursor: CURSOR_POINTER }),
              ...(selected && { background: T.prSoft, borderColor: T.prLine }),
              '&:hover': { transform: 'translateZ(20px) rotateX(3deg)', boxShadow: T.shMd, zIndex: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, ...TNUM }}>
                {v.versionLabel}
              </Box>
              {/* "Working"은 가장 최신 버전(i===0, versions는 최신순)이 미발행일 때만 —
                  과거의 미발행 버전까지 전부 Working으로 보이면 "지금 작업 중인 게 여러
                  개"처럼 잘못 읽힌다(사용자 지적). versions는 artifacts.service.ts가
                  항상 새 항목을 배열 맨 앞에 꽂는 식(unshift와 동일)이라 0번이 최신이다. */}
              {v.isPublished ? (
                <Badge color={T.ok} bg={T.okSoft} borderColor={T.okLine} sx={STATUS_BADGE_SX}>{t('artifact.published')}</Badge>
              ) : i === 0 ? (
                <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine} sx={STATUS_BADGE_SX}>Working</Badge>
              ) : null}
              {/* release 마커 — 이 버전이 처음 release로 나갔던 그 v{seq} 하나(설계서 05장
                  §7.3). 이후 바뀌지 않은 채 다른 release에 반복돼도 배지는 늘지 않는다
                  (사용자 지적) — 클릭하면 release history를 그 release로 열어 보여준다. */}
              {relBadge && (
                <Box
                  component={onOpenRelease ? 'button' : 'span'}
                  onClick={onOpenRelease ? () => onOpenRelease(relBadge.id) : undefined}
                  title="First went out in this release"
                  sx={{
                    fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 700, ...TNUM,
                    padding: '2px 7px', borderRadius: `${R.xs}px`,
                    background: T.prSoft, color: T.pr, border: `1px solid ${T.prLine}`,
                    ...(onOpenRelease && {
                      cursor: CURSOR_POINTER,
                      '&:hover': { background: T.prLine },
                    }),
                  }}
                >
                  {relBadge.label}
                </Box>
              )}
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
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }} title={v.hpcPath}>
                    {v.hpcPath}
                  </Box>
                  <SirenButton
                    variant="ghost"
                    title="Copy path"
                    onClick={() => {
                      navigator.clipboard?.writeText(v.hpcPath as string);
                      toast('Path copied');
                    }}
                    sx={{ minWidth: 0, padding: '2px' }}
                  >
                    <Icon name="copy" size={12} />
                  </SirenButton>
                </Box>
              )}
              {/* Calypso면 항상 SIREN 내부 artifact 페이지로 — v.viewUrl은 Calypso 백엔드의
                  PUBLIC_BASE_URL(폐기된 calypso/web, 5174)로 만들어져 그쪽을 가리키므로
                  쓰지 않는다. 그 외(계약 맺은 진짜 외부 서비스)만 viewUrl을 그대로 연다. */}
              {calypsoArtifactId && projectId ? (
                <Box
                  component={Link}
                  to={`/projects/${projectId}/artifacts/${calypsoArtifactId}`}
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
    </Box>
  );
}

/**
 * 수신 대상 (설계서 04장 §5).
 *
 * ★ **A/B/C 전부 공통** — recipient는 그 workflow의 block에 붙는다. 같은 artifact라도
 *   workflow마다 다를 수 있기 때문이다(같은 artifact가 workflow X·Y 양쪽에 있어도 서로
 *   다른 recipient를 가질 수 있다). 이 목록은 알림 대상이자 **slide 열람의 첫 게이트**다
 *   (§4.1). recipient는 더 이상 edit/view로 나뉘지 않는다 — 속하면 볼 수 있고, 실제
 *   edit 여부는 그 서비스가 정한다.
 * ★ View 권한자에게는 **읽기 전용**으로 노출한다 — 누가 받는지는 볼 수 있어야 한다.
 */
function RecipientsTab({
  block, canEdit, departmentOptions, onSaveRecipients, saving,
}: {
  block: BlockDto;
  canEdit: boolean;
  departmentOptions: string[];
  onSaveRecipients: Props['onSaveRecipients'];
  saving?: boolean;
}) {
  const { t } = useTranslation();

  const initial = block.recipients ?? { departments: [], users: [] };
  const [recipients, setRecipients] = useState<AccessGrant>(initial);

  const dirty = useMemo(
    () => JSON.stringify(recipients) !== JSON.stringify(initial),
    [recipients, initial],
  );

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
          Recipients are set per workflow for this artifact. Being a recipient also grants access to
          this slide — the owning service still decides what is actually visible.
        </Box>
      </Box>

      {!canEdit && (
        <Box sx={{ fontSize: 11.5, color: T.dm2, mb: '10px' }}>{t('artifact.recipientsReadOnly')}</Box>
      )}

      <Card>
        <Ey sx={{ mb: '10px' }}>{t('artifact.recipients')}</Ey>
        <AccessGrantEditor
          value={recipients}
          onChange={setRecipients}
          departmentOptions={departmentOptions}
          readOnly={!canEdit}
        />
      </Card>

      {canEdit && (
        <Box sx={{ mt: '14px' }}>
          <SirenButton
            variant="primary"
            onClick={() => onSaveRecipients(recipients)}
            disabled={saving || !dirty}
          >
            <Icon name="check" /> {saving ? 'Saving…' : 'Save'}
          </SirenButton>
        </Box>
      )}
    </>
  );
}

/**
 * 댓글 — Artifact 전체 또는 특정 버전에 대해 남긴다. Recipients/Access와 달리 BoardPage까지
 * 상태를 올릴 필요가 없는 독립 기능이라 여기서 직접 훅을 호출하고 toast도 바로 처리한다.
 */
function CommentsTab({ block, versions }: { block: BlockDto; versions: ArtifactVersionDto[] }) {
  const { resolveUser } = useDirectory();
  const comments = useComments(block.workflowId, block.id);
  const create = useCreateComment(block.workflowId, block.id);

  const [text, setText] = useState('');
  const [versionId, setVersionId] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const versionOptions = useMemo(
    () => versions.filter((v) => v.id).map((v) => ({ value: v.id as string, label: v.versionLabel })),
    [versions],
  );

  // "General(버전 없음)" 댓글은 지원하지 않는다 - 항상 실제 버전 하나를 가리켜야 하므로
  // 후보가 있으면 기본으로 최신 버전(0번)을 골라 둔다.
  useEffect(() => {
    setVersionId(versionOptions[0]?.value ?? '');
  }, [block.id, versionOptions]);

  const submit = () => {
    const body = text.trim();
    if (!body || !versionId) return;
    create.mutate(
      { text: body, versionId },
      {
        onSuccess: () => setText(''),
        onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to post comment'),
      },
    );
  };

  const submitReply = (parentCommentId: string) => {
    const body = replyText.trim();
    if (!body) return;
    create.mutate(
      { text: body, parentCommentId },
      {
        onSuccess: () => { setReplyText(''); setReplyTo(null); },
        onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to post reply'),
      },
    );
  };

  /** parentCommentId('' = 최상위)별로 묶어 둔다 — 백엔드가 항상 createdAt 오름차순으로
   * 내려주므로(comments.service.ts) 그룹 안 순서도 그대로 최신순 아님/작성순이 유지된다. */
  const byParent = useMemo(() => {
    const map = new Map<string, CommentDto[]>();
    for (const c of comments.data ?? []) {
      const key = c.parentCommentId ?? '';
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [comments.data]);

  const renderNode = (c: CommentDto, depth: number) => {
    const by = resolveUser(c.createdBy);
    const children = byParent.get(c.id) ?? [];
    return (
      <Box key={c.id} sx={{ ml: depth ? `${depth * 20}px` : 0 }}>
        <Card sx={{ padding: '10px 12px', mb: '8px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            <UserAvatar user={by} size={19} />
            <Box sx={{ fontSize: 12, fontWeight: 600 }}>{by?.name ?? c.createdBy}</Box>
            {c.versionLabelSnapshot && (
              <Badge color={T.pr} bg={T.prSoft} borderColor={T.prLine}>{c.versionLabelSnapshot}</Badge>
            )}
            <Box sx={{ flex: 1 }} />
            <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{fmtAt(c.createdAt)}</Box>
          </Box>
          <Box sx={{ fontSize: 12.5, color: T.tx2, mt: '6px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {c.text}
          </Box>
          {canComment && (
            <Box sx={{ mt: '6px' }}>
              <SirenButton
                variant="ghost"
                sx={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}
              >
                Reply
              </SirenButton>
            </Box>
          )}
          {replyTo === c.id && (
            <Box sx={{ mt: '8px' }}>
              <TextArea value={replyText} onChange={setReplyText} rows={2} />
              <Box sx={{ display: 'flex', gap: '6px', mt: '6px' }}>
                <SirenButton
                  variant="primary"
                  onClick={() => submitReply(c.id)}
                  disabled={create.isPending || !replyText.trim()}
                >
                  <Icon name="send" size={12} /> Reply
                </SirenButton>
                <SirenButton variant="ghost" onClick={() => { setReplyTo(null); setReplyText(''); }}>
                  Cancel
                </SirenButton>
              </Box>
            </Box>
          )}
        </Card>
        {children.map((child) => renderNode(child, depth + 1))}
      </Box>
    );
  };

  const topLevel = byParent.get('') ?? [];
  /** 실제 등록된(= id가 있는) 버전이 하나도 없으면 댓글 자체를 남길 수 없다 — "일반" 댓글도
   * 예외 없다. 기존에(버전이 있던 시절) 남겨진 댓글이 있다면 목록은 그대로 보여준다. */
  const canComment = versionOptions.length > 0;

  return (
    <>
      <Card sx={{ mb: '14px' }}>
        {canComment ? (
          <>
            <Ey sx={{ mb: '8px' }}>New comment</Ey>
            <TextArea value={text} onChange={setText} rows={3} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: '8px' }}>
              <Box sx={{ width: 200 }}>
                <SelectInput
                  value={versionId}
                  onChange={setVersionId}
                  options={versionOptions}
                />
              </Box>
              <Box sx={{ flex: 1 }} />
              <SirenButton variant="primary" onClick={submit} disabled={create.isPending || !text.trim() || !versionId}>
                <Icon name="send" size={12} /> Post
              </SirenButton>
            </Box>
          </>
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2, lineHeight: 1.6 }}>
            Comments open up once this artifact has at least one registered version.
          </Box>
        )}
      </Card>

      {comments.isLoading ? (
        <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
          Loading comments…
        </Box>
      ) : topLevel.length === 0 ? (
        <Box sx={{ padding: '32px 8px', textAlign: 'center', color: T.dm2, fontSize: 12.5 }}>
          No comments yet.
        </Box>
      ) : (
        topLevel.map((c) => renderNode(c, 0))
      )}
    </>
  );
}
