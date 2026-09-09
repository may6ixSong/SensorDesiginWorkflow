import { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectDetailDto, WorkflowPhase } from '@/types/domain';
import { useAuth } from '@/app/providers/AuthProvider';
import { shortDate } from '@/lib/schedule';
import {
  CanvasNode, VersionView, fmtAt, hasW, isOrphanPhase, latA, latR, stOf, vstr,
} from '@/lib/canvasModel';
import { useCanvasStore } from '@/store/canvasStore';
import { useArtifactServices } from '@/api/hooks/useHub';
import { useDeliverableLiveAccess, useDeliverableLiveVersions } from '@/api/hooks/useDeliverables';
import { LiveVersionRecordDto } from '@/types/domain';
import { RECEIVABLE_DEPARTMENTS, departmentName } from '@/shared/constants/departments';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { UserSearchDialog } from '@/components/dialogs/UserSearchDialog';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SlidePanel } from '@/components/common/SlidePanel';
import { VersionTree } from '@/components/deliverable/VersionTree';
import { VersionContents } from '@/components/deliverable/VersionContents';
import { ExternalArtifactPicker } from '@/components/deliverable/ExternalArtifactPicker';
import { CalypsoArtifactPicker } from '@/components/deliverable/CalypsoArtifactPicker';
import { ArtifactVersionTree } from '@/components/artifact/ArtifactVersionTree';
import { ArtifactVersionContents } from '@/components/artifact/ArtifactVersionContents';
import { ArtifactAccessPanel } from '@/components/artifact/ArtifactAccessPanel';
import { SirenButton, Badge } from '@/components/common/SirenButton';
import { Card, Ey, Field, Row, SelectInput, TextInput } from '@/components/common/Panel';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { queryKeys } from '@/api/queryKeys';
import {
  CalypsoArtifact, CalypsoGrantInput, CalypsoVersionView, addCalypsoEditor, addCalypsoViewGrant,
  downloadCalypsoVersion, getCalypsoArtifact, releaseCalypsoArtifact,
  removeCalypsoEditor, removeCalypsoViewGrant, setCalypsoUserDepartments, uploadCalypsoVersion,
} from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/**
 * 삭제는 이 phase에 걸린 산출물 사본 하나만 지운다(다른 phase의 사본에는 영향 없음) —
 * 그 의미를 시스템 언어와 무관하게 항상 영어로 고정 표시한다(사용자 요청).
 */
const DELETE_LABEL = 'Delete artifact for this phase';

export interface AssertVersionInput {
  versionLabel: string;
  note: string;
  isReleased: boolean;
}

interface Props {
  node: CanvasNode | null;
  phases: WorkflowPhase[];
  /** 이 workflow의 Edit 권한 (canEditWorkflow) */
  own: boolean;
  /** Calypso 연동 산출물의 ACL(부서 단위 부여) 후보를 계산하는 데 쓴다 — 없으면(로딩 중) 후보가 비어 보인다. */
  project?: ProjectDetailDto;
  onClose: () => void;
  onSaveInfo: (p: {
    name: string; artifactKey: string | null;
    serviceKey: string | null; externalArtifactId: string | null; artifactTypeKey: string | null;
  }) => void;
  /** C/D 티어 수동 버전 기록 — 연동된 서비스가 없는 산출물에서만 쓴다. */
  onAssertVersion: (p: AssertVersionInput) => void;
  /** 가장 최근 작업본을 릴리스로 승격 — note를 함께 남긴다. */
  onRelease: (note: string) => void;
  onSaveRecv: (p: { recvDept: string | null; recvContact: string | null }) => void;
  /** 삭제 확인 후 호출된다 — 실제 삭제 API 호출과 dialog 닫기는 호출부(BoardPage) 책임. */
  onDelete: () => void;
}

/**
 * 산출물 상세 — 우측에서 슬라이드로 열리는 패널(SlidePanel). 탭으로 나누지 않고
 * A|B 두 컬럼을 한 화면에 동시에 보여준다(사용자 요청) — 3:1.
 *
 *  A(왼쪽, 넓게) = 지금 고른 버전의 내용(문서면) + (내가 편집 가능하면) 버전 기록 폼.
 *    "업로드"는 여기 있다 — 예전엔 오른쪽 탭 안에 있었는데, 내용을 보는 자리와
 *    새 버전을 남기는 자리가 같은 컬럼에 있는 게 자연스럽다.
 *  B(오른쪽, 좁게) = 요약 배지 → 버전 트리 → 기본 정보 편집 → 연결 → 전달, 전부
 *    한 번에 스크롤되는 하나의 레일. 버전 이력도 더 이상 별도 탭이 아니라 이 레일
 *    안에서 트리 형태로 바로 보인다.
 *
 * flow(연결)는 여기서 만들거나 지우지 않는다(사용자 요청) — 연결은 캔버스에서 pin을 끌어
 * 잇는 것으로만 하고, 이 화면에는 "무엇과 이어져 있는지" 읽기 전용 목록만 남긴다.
 */
export function DeliverableDialog({
  node: d, phases, own, project, onClose,
  onSaveInfo, onAssertVersion, onRelease, onSaveRecv, onDelete,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  /** 내용 면에 띄울 버전 — 트리에서 고른 것. 산출물이 바뀌면 최신으로 되돌린다. */
  const [picked, setPicked] = useState<VersionView | null>(null);
  /** Calypso에 연동된 산출물이면 이쪽에서 고른 버전을 쓴다 — 아래 calypsoLinked 참고. */
  const [calypsoPicked, setCalypsoPicked] = useState<CalypsoVersionView | null>(null);
  /** Calypso 이외의 연동 서비스면 이쪽에서 고른 버전을 쓴다 — 아래 externalLinked 참고. */
  const [externalPicked, setExternalPicked] = useState<LiveVersionRecordDto | null>(null);
  /** B영역 탭 — 전달(Handoff)만 다시 탭으로 분리한다(사용자 요청), 나머지는 한 레일. */
  const [bTab, setBTab] = useState<'overview' | 'handoff'>('overview');

  useEffect(() => setPicked(null), [d?.id]);
  useEffect(() => setCalypsoPicked(null), [d?.id]);
  useEffect(() => setExternalPicked(null), [d?.id]);
  useEffect(() => setBTab('overview'), [d?.id]);

  const qc = useQueryClient();
  /**
   * serviceKey==='calypso'로 연동된 산출물은 SIREN 자체 versions(수동 assert 기록,
   * C/D 티어용)가 아니라 Calypso에 실제로 등록된 버전을 보여준다 — "연동만 해두면
   * 실제 데이터가 그대로 보여야 한다"(사용자 요청). Artifacts page와 같은
   * calypsoClient로 브라우저에서 직접 물어본다 — SIREN api를 거치는 별도 동기화는
   * 아직 없다.
   */
  const calypsoLinked = d?.serviceKey === 'calypso' && !!d?.externalArtifactId;
  const externalArtifactId = d?.externalArtifactId ?? '';
  /** Artifact ACL의 부서 단위 부여 후보 — 이 workflow의 project 안에서 내가 속한 부서. */
  const myDepartments = useMemo(
    () => project?.members.find((m) => m.knoxId === user?.KnoxID)?.departments ?? [],
    [project?.members, user?.KnoxID],
  );
  const {
    data: calypsoArtifact, isLoading: calypsoLoading, isError: calypsoError, error: calypsoErrorObj,
  } = useQuery({
    queryKey: queryKeys.calypsoArtifact(externalArtifactId),
    queryFn: () => {
      setCalypsoUserDepartments(myDepartments);
      return getCalypsoArtifact(externalArtifactId);
    },
    enabled: calypsoLinked,
    retry: false,
  });
  const calypsoForbidden = (calypsoErrorObj as any)?.response?.status === 403;

  // Details를 열었는데 연동된 산출물에 view 권한이 없는 경우(사용자 요청) — toast로
  // 알리고 패널 자체를 닫는다. 빈 패널이 계속 떠 있으면 안 된다("slide는 그대로
  // 노출되면 안 된다"는 지적) — 콘텐츠가 없는 패널을 열어둔 채로 두지 않는다.
  useEffect(() => {
    if (calypsoForbidden) {
      toast('You do not have view access to this artifact.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calypsoForbidden]);

  /**
   * Calypso 이외의 연동 서비스는 그 서비스에 실시간으로 access를 물어봐 3-state(차단/
   * 열람 전용/편집)를 가른다(설계서 §19.5, §19.6) — Calypso처럼 SIREN이 자체 판정을
   * 대신하지 않는다. fail-closed이므로 응답이 없거나 실패해도 canView는 false다.
   */
  const externalLinked = !!d?.serviceKey && d.serviceKey !== 'calypso' && !!d?.externalArtifactId;
  const { data: liveAccess, isLoading: liveAccessLoading } = useDeliverableLiveAccess(d?.id, externalLinked);
  const liveCanView = liveAccess?.canView === true;
  const liveCanEdit = liveAccess?.canEdit === true;
  const { data: liveVersions } = useDeliverableLiveVersions(d?.id, externalLinked && liveCanView);
  const externalForbidden = externalLinked && !liveAccessLoading && !liveCanView;
  useEffect(() => {
    if (d && externalForbidden) {
      toast('You do not have view access to this artifact.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id, externalForbidden]);

  /**
   * Calypso도 아니고 다른 서비스에 연동되지도 않은(mapping 안 된) 산출물은 확인할 외부
   * ACL이 없다 — 그런 산출물의 "권한"은 이 workflow 자체의 Edit 권한(own)으로 대신한다
   * (사용자 요청: "권한 없으면 무조건 차단" — 컨텐츠가 비어 있어도 패널 구조 자체가
   * 열리는 것도 안 된다). own이 아니면 calypso-forbidden과 똑같이 toast + 자동 닫힘.
   */
  const unmappedForbidden = !calypsoLinked && !externalLinked && !own;
  useEffect(() => {
    if (d && unmappedForbidden) {
      toast('You do not have access to this artifact.');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id, unmappedForbidden]);

  const invalidateCalypso = () => {
    qc.invalidateQueries({ queryKey: queryKeys.calypsoArtifact(externalArtifactId) });
    qc.invalidateQueries({ queryKey: ['calypso', 'artifacts'] });
  };
  const uploadCalypso = useMutation({
    mutationFn: ({ file, note }: { file: File; note: string }) => uploadCalypsoVersion(externalArtifactId, file, note),
    onSuccess: () => { invalidateCalypso(); toast('Working copy uploaded'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Upload failed'),
  });
  const releaseCalypso = useMutation({
    mutationFn: (note: string) => releaseCalypsoArtifact(externalArtifactId, note),
    onSuccess: () => { invalidateCalypso(); toast('Released'); },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Release failed'),
  });
  const addEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoEditor(externalArtifactId, g),
    onSuccess: invalidateCalypso,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant edit access'),
  });
  const removeEditor = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoEditor(externalArtifactId, g),
    onSuccess: invalidateCalypso,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove editor'),
  });
  const addViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => addCalypsoViewGrant(externalArtifactId, g),
    onSuccess: invalidateCalypso,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not grant view access'),
  });
  const removeViewGrant = useMutation({
    mutationFn: (g: CalypsoGrantInput) => removeCalypsoViewGrant(externalArtifactId, g),
    onSuccess: invalidateCalypso,
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Could not remove viewer'),
  });
  const handleCalypsoDownload = async (v: CalypsoVersionView) => {
    try {
      const blob = await downloadCalypsoVersion(externalArtifactId, v.versionRef);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = v.fileName || `${externalArtifactId}-v${v.versionLabel}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Download failed');
    }
  };

  if (!d) return null;
  const ph = phases.find((p) => p.id === d.phase);
  const orphan = isOrphanPhase(phases, d.phase);
  const st = stOf(d);
  const received = d.intent === 'received';
  const shown = picked ?? (own ? latA(d) : latR(d));
  const calypsoShown = calypsoPicked ?? calypsoArtifact?.latestVersion ?? null;
  const externalShown = externalPicked ?? liveVersions?.[0] ?? null;
  /** 실물을 소유한 서비스가 붙어 있으면 버전은 그쪽에서 올라온다 — SIREN에서 못 쓴다(§1.2). */
  const canRecord = own && !received && !d.serviceKey;
  /**
   * "Open in Artifact page" — 지금은 Calypso만 SIREN 안에 실제 상세 페이지가 있다
   * (설계서 §11.5). 다른 서비스는 아직 그 화면이 없어 링크를 내지 않는다.
   */
  const canOpenArtifactPage = d.serviceKey === 'calypso' && !!d.externalArtifactId;

  return (
    <SlidePanel
      open
      onClose={onClose}
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
          <Box component="span" sx={{ color: d.serviceKey ? T.tl : T.bl, mt: '4px' }}>
            <Icon name={d.serviceKey ? 'link' : 'word'} size={18} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Ey>{ph ? `${ph.name} · ${shortDate(ph.start)} → ${shortDate(ph.end)}` : 'No release schedule'}</Ey>
            <Box sx={{ fontSize: 19, fontWeight: 700, mt: '3px', letterSpacing: '-.015em' }}>{d.name}</Box>
          </Box>
          <Box sx={{ display: 'flex', gap: '5px', mt: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {orphan && <Badge color={T.rd} bg={T.rd2} borderColor={T.rd3}>Schedule lost</Badge>}
            <Badge color={st.c} bg={st.bg} borderColor={st.bd}>{st.lb}</Badge>
            {d.serviceKey ? (
              <Badge color={T.tl} bg={T.tl2} borderColor={T.tl3}>{d.serviceKey.toUpperCase()}</Badge>
            ) : (
              <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>Unlinked</Badge>
            )}
          </Box>
        </Box>
      }
      footer={own && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SirenButton
            variant="ghost"
            onClick={() => setConfirmDeleteOpen(true)}
            sx={{ color: T.rd, borderColor: T.rd3 }}
          >
            <Icon name="trash" /> {DELETE_LABEL}
          </SirenButton>
        </Box>
      )}
    >
      {/* A — 내용 + (편집 가능하면) 버전 기록. Calypso 연동이면 SIREN 자체 기록이 아니라
          Calypso의 실제 버전/업로드를 그대로 보여준다(ArtifactVersionContents는 이미
          자기 몫의 스크롤/패딩/가운데정렬을 갖고 있어 그대로 flex 컬럼에 낀다). "Open in
          Artifact page"는 내용 바로 위, 이 컬럼에 둔다(사용자 요청 — B에서 이동). */}
      <Box sx={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.ln}` }}>
        {canOpenArtifactPage && (
          <Box sx={{ flex: '0 0 auto', padding: '11px 22px', borderBottom: `1px solid ${T.ln}`, background: T.sf2 }}>
            <SirenButton
              variant="primary"
              onClick={() => navigate(`/artifacts/${d.externalArtifactId}`)}
            >
              <Icon name="expand" /> Open in Artifact page
            </SirenButton>
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {calypsoLinked && calypsoArtifact ? (
            <ArtifactVersionContents
              a={calypsoArtifact}
              version={calypsoShown}
              canEdit={calypsoArtifact.myAccess === 'edit'}
              onDownload={handleCalypsoDownload}
              onUpload={(file, note) => uploadCalypso.mutate({ file, note })}
              onRelease={(note) => releaseCalypso.mutate(note)}
              uploading={uploadCalypso.isPending}
              releasing={releaseCalypso.isPending}
            />
          ) : calypsoLinked && calypsoLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : calypsoLinked && calypsoError ? (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '22px' }}>
              <Box sx={{ fontSize: 13.5, fontWeight: 600 }}>
                {calypsoForbidden ? 'You do not have view access to this artifact' : 'Could not load the linked Calypso artifact'}
              </Box>
              <Box sx={{ fontSize: 12, color: T.dm2 }}>
                {calypsoForbidden
                  ? 'Ask its registrant or an editor to grant you access.'
                  : 'It may not exist in Calypso, or the link is stale.'}
              </Box>
            </Box>
          ) : externalLinked && liveAccessLoading ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : externalLinked ? (
            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px' }}>
              <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto' }}>
                <ExternalVersionContents version={externalShown} canEdit={liveCanEdit} />
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.sf3, padding: '22px' }}>
              <Box sx={{ width: '100%', maxWidth: 660, mx: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <VersionContents d={d} version={shown} />
                {canRecord && (
                  <RecordVersionCard
                    latest={hasW(d) ? latA(d) : null}
                    onAssertVersion={onAssertVersion}
                    onRelease={onRelease}
                  />
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* B — 요약 / 버전 트리 / 기본 정보 / 연결은 한 레일, 전달(Handoff)만 다시 별도
          탭으로 분리한다(사용자 요청 — 예전처럼). 받는 산출물(received)이면 애초에
          전달 섹션 자체가 없으므로 탭 바를 안 띄운다. */}
      <Box sx={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', background: T.sf2 }}>
        {!received && (
          <Box sx={{ flex: '0 0 auto', display: 'flex', gap: '2px', padding: '10px 14px 0', borderBottom: `1px solid ${T.ln}` }}>
            {([
              { key: 'overview' as const, label: 'Overview' },
              { key: 'handoff' as const, label: t('deliverable.recipientDeptTitle') },
            ]).map(({ key, label }) => (
              <Box
                key={key}
                component="button"
                onClick={() => setBTab(key)}
                sx={{
                  padding: '8px 12px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                  color: bTab === key ? T.tl : T.dm, background: 'none', border: 'none',
                  borderBottom: `2px solid ${bTab === key ? T.tl : 'transparent'}`,
                  mb: '-1px', cursor: CURSOR_POINTER,
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
        )}

        {bTab === 'handoff' && !received ? (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px' }}>
            <HandoffSection d={d} own={own} onSave={onSaveRecv} />
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {externalLinked ? (
              <ExternalVersionSummary versions={liveVersions ?? []} canEdit={liveCanEdit} />
            ) : (
              <VersionSummary d={d} own={own} calypso={calypsoLinked ? calypsoArtifact ?? null : undefined} />
            )}

            <Card>
              <Ey sx={{ mb: '9px' }}>Version history</Ey>
              {calypsoLinked ? (
                <ArtifactVersionTree
                  versions={calypsoArtifact?.versions ?? []}
                  selected={calypsoShown}
                  onSelect={setCalypsoPicked}
                />
              ) : externalLinked ? (
                <ExternalVersionList
                  versions={liveVersions ?? []}
                  selected={externalShown}
                  onSelect={setExternalPicked}
                />
              ) : (
                <VersionTree versions={d.versions} selected={shown} onSelect={setPicked} />
              )}
            </Card>

            {externalLinked && liveCanEdit && (externalShown?.editors?.length ?? 0) > 0 && (
              <ExternalEditorsCard editors={externalShown!.editors as string[]} />
            )}

            {calypsoLinked && calypsoArtifact && calypsoArtifact.myAccess === 'edit' && (
              <ArtifactAccessPanel
                artifact={calypsoArtifact}
                myDepartments={myDepartments}
                allDepartments={project?.departments ?? []}
                onAddEditor={(g) => addEditor.mutate(g)}
                onRemoveEditor={(g) => removeEditor.mutate(g)}
                onAddViewGrant={(g) => addViewGrant.mutate(g)}
                onRemoveViewGrant={(g) => removeViewGrant.mutate(g)}
              />
            )}

            {own && (
              <BasicInfoCard
                d={d} phases={phases} nodes={nodes} project={project} myDepartments={myDepartments}
                onSaveInfo={onSaveInfo}
              />
            )}

            <FlowLinksCard d={d} phases={phases} nodes={nodes} edges={edges} />
          </Box>
        )}
      </Box>

      {confirmDeleteOpen && (
        <ConfirmDialog
          title={DELETE_LABEL}
          message={t('deliverable.deleteMessage', { name: d.name })}
          warning={t('deliverable.deleteWarning')}
          confirmLabel={t('deliverable.delete')}
          cancelLabel={t('deliverable.cancel')}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => { setConfirmDeleteOpen(false); onDelete(); }}
        />
      )}
    </SlidePanel>
  );
}

/* ── A: 버전 기록 폼 (구 Overview 탭 "Record a version") ── */
function RecordVersionCard({
  latest, onAssertVersion, onRelease,
}: {
  latest: VersionView | null;
  onAssertVersion: Props['onAssertVersion'];
  onRelease: Props['onRelease'];
}) {
  const [vLabel, setVLabel] = useState('');
  const [vNote, setVNote] = useState('');
  const [vErr, setVErr] = useState('');

  const submitVersion = (isReleased: boolean) => {
    const label = vLabel.trim();
    if (!label) { setVErr('Enter a version label.'); return; }
    setVErr('');
    onAssertVersion({ versionLabel: label, note: vNote.trim(), isReleased });
    setVLabel(''); setVNote('');
  };

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Record a version</Ey>
      <Row>
        <Field label="Version" sx={{ flex: '0 0 130px' }}>
          <TextInput
            value={vLabel}
            onChange={(v) => { setVLabel(v); setVErr(''); }}
            error={!!vErr}
            placeholder="e.g. 1.2"
          />
        </Field>
        <Field label="Note" sx={{ flex: 1 }}>
          <TextInput value={vNote} onChange={setVNote} placeholder="What changed in this version" />
        </Field>
      </Row>
      {vErr && <Box sx={{ fontSize: 11, color: T.rd, margin: '-5px 0 9px' }}>{vErr}</Box>}
      <Box sx={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
        <SirenButton onClick={() => submitVersion(false)}>
          <Icon name="up" /> Save working
        </SirenButton>
        <SirenButton variant="primary" onClick={() => submitVersion(true)}>
          <Icon name="send" /> Save & release
        </SirenButton>
      </Box>
      {latest && (
        <Box sx={{ mt: '10px', paddingTop: '10px', borderTop: `1px solid ${T.ln}` }}>
          <SirenButton
            onClick={() => { onRelease(vNote.trim()); setVNote(''); }}
            sx={{ color: T.tl, borderColor: T.tl3 }}
          >
            <Icon name="send" /> Release {vstr(latest)} as-is
          </SirenButton>
        </Box>
      )}
    </Card>
  );
}

/**
 * A: Calypso 이외의 연동 서비스(§19.5, §19.6) — 그 서비스가 knoxId 기준으로 이미
 * 필터링해 준 레코드를 그대로 문서면처럼 보여준다. tier/note/hpcPath 같은 SIREN 자체
 * 필드는 이 계약에 없으므로(ObserverVersionRecord) VersionContents보다 단순하다.
 */
function ExternalVersionContents({
  version: v, canEdit,
}: { version: LiveVersionRecordDto | null; canEdit: boolean }) {
  const { resolveUser } = useDirectory();

  if (!v) {
    return (
      <Box
        sx={{
          border: `1px dashed ${T.ln2}`, borderRadius: '12px', background: T.sf,
          padding: '40px 20px', textAlign: 'center', color: T.dm2,
        }}
      >
        <Icon name="word" size={24} />
        <Box sx={{ fontSize: 12.5, mt: '9px' }}>No version to show yet.</Box>
      </Box>
    );
  }

  const by = v.giverKnoxId ? resolveUser(v.giverKnoxId) : null;
  const accent = v.isReleased ? T.tl : T.am;

  return (
    <Box
      sx={{
        background: T.sf, border: `1px solid ${T.ln}`, borderRadius: '12px',
        boxShadow: T.sl, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <Box sx={{ height: 4, background: accent, flex: '0 0 auto' }} />
      <Box sx={{ padding: '24px 28px 26px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1 }}>
            {v.versionLabel}
          </Box>
          <Badge color={accent} bg={v.isReleased ? T.tl2 : T.am2} borderColor={v.isReleased ? T.tl3 : T.am3}>
            {v.isReleased ? 'RELEASE' : 'WORKING'}
          </Badge>
          {!canEdit && <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>View only</Badge>}
        </Box>

        {by && (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: '9px', mt: '16px',
              paddingTop: '15px', borderTop: `1px solid ${T.ln}`,
            }}
          >
            <UserAvatar user={by} size={30} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 13, fontWeight: 600 }}>{by.name}</Box>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2, mt: '2px' }}>
                {v.observedAt ? fmtAt(v.observedAt) : '—'}
                {v.giverDept ? ` · ${v.giverDept}` : ''}
              </Box>
            </Box>
          </Box>
        )}

        {(v.sourceRefs?.length ?? 0) > 0 && (
          <Box sx={{ mt: '18px' }}>
            <Box
              sx={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em',
                textTransform: 'uppercase', color: T.dm2, mb: '8px',
              }}
            >
              Built from
            </Box>
            {v.sourceRefs.map((s) => (
              <Box
                key={`${s.serviceKey}:${s.versionRef}`}
                sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderTop: `1px solid ${T.ln}` }}
              >
                <Box component="span" sx={{ color: T.dm2 }}><Icon name="link" size={12} /></Box>
                <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{s.artifactKey || s.serviceKey}</Box>
                <Box sx={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.dm2 }}>
                  {s.serviceKey} · {s.versionLabel || s.versionRef}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ mt: '18px', paddingTop: '18px', borderTop: `1px solid ${T.ln}` }}>
          <Box
            sx={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.15em',
              textTransform: 'uppercase', color: T.dm2, mb: '9px',
            }}
          >
            Location
          </Box>
          {v.viewUrl ? (
            <SirenButton onClick={() => window.open(v.viewUrl as string, '_blank', 'noopener')}>
              <Icon name="link" /> Open in source
            </SirenButton>
          ) : (
            <Box sx={{ fontSize: 12.5, color: T.dm2 }}>No link recorded for this version.</Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/** B: Calypso 이외의 연동 서비스 — 버전 이력을 그 서비스가 준 순서(최신 우선) 그대로 나열한다. */
function ExternalVersionList({
  versions, selected, onSelect,
}: { versions: LiveVersionRecordDto[]; selected: LiveVersionRecordDto | null; onSelect: (v: LiveVersionRecordDto) => void }) {
  if (!versions.length) {
    return (
      <Box
        sx={{
          border: `1px dashed ${T.ln2}`, borderRadius: '10px', background: T.sf,
          padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: T.dm2,
        }}
      >
        No versions visible to you yet.
      </Box>
    );
  }
  return (
    <Box>
      {versions.map((v, i) => {
        const isSel = selected === v;
        return (
          <Box
            key={`${v.versionLabel}-${i}`}
            onClick={() => onSelect(v)}
            sx={{
              mb: '8px', background: isSel ? (v.isReleased ? T.tl2 : T.am2) : T.sf,
              border: `1px solid ${isSel ? (v.isReleased ? T.tl3 : T.am3) : T.ln}`,
              borderRadius: '9px', padding: '8px 11px 9px', cursor: CURSOR_POINTER,
              transition: 'background .15s, border-color .15s',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: v.isReleased ? T.tl : T.am }}>
                {v.versionLabel}
              </Box>
              <Badge color={v.isReleased ? T.tl : T.am} bg={v.isReleased ? T.tl2 : T.am2} borderColor={v.isReleased ? T.tl3 : T.am3}>
                {v.isReleased ? 'RELEASE' : 'WORKING'}
              </Badge>
              {i === 0 && <Badge color={T.vi} bg={T.vi2} borderColor={T.vi3}>LATEST</Badge>}
            </Box>
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, mt: '5px' }}>
              {v.giverKnoxId ?? '—'} · {v.observedAt ? fmtAt(v.observedAt) : '—'}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** B: 요약 배지 — Calypso 이외의 연동 서비스용. canEdit가 아니면 Working copy는 항상 잠긴다. */
function ExternalVersionSummary({ versions, canEdit }: { versions: LiveVersionRecordDto[]; canEdit: boolean }) {
  const released = versions.find((v) => v.isReleased) ?? null;
  const working = canEdit ? versions.find((v) => !v.isReleased) ?? null : null;
  return (
    <Row>
      <Card sx={{ flex: 1, minWidth: 0 }}>
        <Ey>Recipient sees</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.tl, mt: '5px' }}>
          {released ? released.versionLabel : '—'}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>
          {released?.observedAt ? fmtAt(released.observedAt) : 'No release yet'}
        </Box>
      </Card>
      <Card sx={{ flex: 1, minWidth: 0, opacity: canEdit ? 1 : 0.5 }}>
        <Ey>Working copy</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.am, mt: '5px', display: 'flex', alignItems: 'center' }}>
          {canEdit ? (working ? working.versionLabel : 'None') : <Icon name="lock" />}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>
          {canEdit ? (working?.observedAt ? fmtAt(working.observedAt) : 'No changes since release') : 'editors only'}
        </Box>
      </Card>
    </Row>
  );
}

/** B: 그 서비스가 edit 권한이 있는 호출자에게만 채워 보낸 편집자 목록(§19.2). */
function ExternalEditorsCard({ editors }: { editors: string[] }) {
  const { resolveUser } = useDirectory();
  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Editors</Ey>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {editors.map((knoxId) => (
          <Box key={knoxId} sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserAvatar user={resolveUser(knoxId)} size={20} />
            <Box sx={{ fontSize: 12 }}>{resolveUser(knoxId).name}</Box>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

/**
 * B: 버전 요약 배지. calypso가 undefined면 연동 안 된 산출물 — SIREN 자체 기록(d.versions)을
 * 쓴다. calypso가 CalypsoArtifact(또는 아직 로딩/에러라 null)면 연동된 산출물 — 그쪽의
 * releasedVersion/latestVersion을 쓴다(사용자 요청: 연동만 해두면 실제 데이터가 보여야 함).
 */
function VersionSummary({
  d, own, calypso,
}: { d: CanvasNode; own: boolean; calypso?: CalypsoArtifact | null }) {
  const linked = calypso !== undefined;
  const relLabel = linked
    ? (calypso?.releasedVersion ? `v${calypso.releasedVersion.versionLabel}` : null)
    : (latR(d) ? vstr(latR(d) as VersionView) : null);
  const relAt = linked
    ? (calypso?.releasedVersion ? fmtAt(calypso.releasedVersion.createdAt) : null)
    : (latR(d) ? fmtAt((latR(d) as VersionView).at) : null);
  const workSrc = linked
    ? (calypso?.latestVersion && !calypso.latestVersion.isReleased ? calypso.latestVersion : null)
    : (hasW(d) ? latA(d) : null);
  const workLabel = linked
    ? (workSrc ? `v${(workSrc as CalypsoVersionView).versionLabel}` : null)
    : (workSrc ? vstr(workSrc as VersionView) : null);
  const workAt = linked
    ? (workSrc ? fmtAt((workSrc as CalypsoVersionView).createdAt) : null)
    : (workSrc ? fmtAt((workSrc as VersionView).at) : null);

  return (
    <Row>
      <Card sx={{ flex: 1, minWidth: 0 }}>
        <Ey>Recipient sees</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.tl, mt: '5px' }}>
          {relLabel ?? '—'}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>{relAt ?? 'No release yet'}</Box>
      </Card>
      <Card sx={{ flex: 1, minWidth: 0, opacity: own ? 1 : 0.5 }}>
        <Ey>Working copy</Ey>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600, color: T.am, mt: '5px', display: 'flex', alignItems: 'center' }}>
          {own ? (workLabel ?? 'None') : <Icon name="lock" />}
        </Box>
        <Box sx={{ fontSize: 10, color: T.dm2, mt: '3px' }}>
          {own ? (workAt ?? 'No changes since release') : 'owners only'}
        </Box>
      </Card>
    </Row>
  );
}

/**
 * B: 기본 정보 편집. Artifact key와 마찬가지로 External artifact ID도 이 화면에 노출하지
 * 않는다(사용자 요청) — 그 값은 내부 연결용 id일 뿐이라 사람이 직접 타이핑할 자리가
 * 아니고, Source를 실제로 어떻게 고를지(예: Artifact list에서 등록한 산출물을 고르는 식)는
 * 나중에 다시 설계한다. 지금은 있던 값을 그대로 들고 저장만 한다.
 */
type SourceMode = 'none' | 'service' | 'calypso';
const sourceModeFor = (serviceKey: string | null): SourceMode =>
  serviceKey === 'calypso' ? 'calypso' : serviceKey ? 'service' : 'none';

function BasicInfoCard({
  d, phases, nodes, project, myDepartments, onSaveInfo,
}: {
  d: CanvasNode; phases: WorkflowPhase[]; nodes: CanvasNode[]; project?: ProjectDetailDto;
  myDepartments: string[];
  onSaveInfo: Props['onSaveInfo'];
}) {
  const { data: services } = useArtifactServices();
  const rev = useCanvasStore((s) => s.rev);
  const sid = d.series || d.id;
  const relatedPhases = useMemo(
    () => new Set(
      nodes
        .filter((x) => (x.series || x.id) === sid || (!!d.artifactKey && x.artifactKey === d.artifactKey))
        .map((x) => x.phase),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, sid, d.artifactKey, rev],
  );

  const [name, setName] = useState(d.name);
  const [sourceMode, setSourceMode] = useState<SourceMode>(sourceModeFor(d.serviceKey));
  const [serviceKey, setServiceKey] = useState(d.serviceKey ?? '');
  const [artifactTypeKey, setArtifactTypeKey] = useState(d.artifactTypeKey ?? '');
  // 예전엔 이 화면에서 아예 편집할 수 없었다 — 오타를 내면 고칠 방법이 없는 게 가장
  // 위험한 문제였다(Hub 설계서 §19.3). 이제 자유 텍스트가 아니라 후보 선택으로만 고친다.
  const [externalArtifactId, setExternalArtifactId] = useState(d.externalArtifactId ?? '');
  const [nameErr, setNameErr] = useState(false);
  const [typeErr, setTypeErr] = useState(false);
  const orphan = isOrphanPhase(phases, d.phase);

  useEffect(() => {
    setName(d.name);
    setSourceMode(sourceModeFor(d.serviceKey));
    setServiceKey(d.serviceKey ?? '');
    setArtifactTypeKey(d.artifactTypeKey ?? '');
    setExternalArtifactId(d.externalArtifactId ?? '');
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedService = (services ?? []).find((s) => s.key === serviceKey) ?? null;
  const artifactTypes = selectedService?.artifactTypes ?? [];

  /** Tier A(연동된 서비스)와 Calypso는 등록 방법이 완전히 다르다 — code+revision 후보
   * 검색 vs 내가 view 권한 있는 Calypso artifact 목록. 그래서 같은 dropdown 하나에
   * 섞지 않고 먼저 방식부터 고르게 한다(사용자 요청). */
  const switchSourceMode = (mode: SourceMode) => {
    setSourceMode(mode);
    setExternalArtifactId('');
    setArtifactTypeKey('');
    setServiceKey(mode === 'calypso' ? 'calypso' : '');
    setTypeErr(false);
  };

  const submit = () => {
    if (!name.trim()) { setNameErr(true); return; }
    if (serviceKey && artifactTypes.length > 1 && !artifactTypeKey) { setTypeErr(true); return; }
    setTypeErr(false);
    // artifactKey는 이 화면에서 편집하지 않는다 — 있던 값을 그대로 들고 저장한다.
    onSaveInfo({
      name: name.trim(), artifactKey: d.artifactKey,
      serviceKey: serviceKey || null, externalArtifactId: externalArtifactId.trim() || null,
      artifactTypeKey: artifactTypes.length > 0 ? artifactTypeKey || null : null,
    });
  };

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>Edit basic info</Ey>
      <Field label="Name">
        <TextInput value={name} onChange={(v) => { setName(v); setNameErr(false); }} error={nameErr} />
      </Field>
      <Field label="Source — where this deliverable's real data lives" sx={{ mb: '12px' }}>
        <Box sx={{ display: 'flex', gap: '5px' }}>
          {([
            { m: 'none' as const, label: 'Not linked' },
            { m: 'service' as const, label: 'Connected Service' },
            { m: 'calypso' as const, label: 'Calypso' },
          ]).map(({ m, label }) => (
            <Box
              key={m}
              component="button"
              type="button"
              onClick={() => switchSourceMode(m)}
              sx={{
                flex: 1, fontSize: 11.5, fontWeight: 600, padding: '7px 8px',
                borderRadius: '7px', transition: '.14s', cursor: CURSOR_POINTER,
                background: sourceMode === m ? T.tl2 : T.sf,
                border: `1px solid ${sourceMode === m ? T.tl : T.ln2}`,
                color: sourceMode === m ? T.tl : T.dm,
                '&:hover': { background: sourceMode === m ? T.tl2 : T.sf3 },
              }}
            >
              {label}
            </Box>
          ))}
        </Box>
      </Field>

      {sourceMode === 'service' && (
        <>
          <Field label="Connected service" sx={{ mb: artifactTypes.length > 1 ? '12px' : 0 }}>
            <SelectInput
              value={serviceKey}
              onChange={(v) => {
                setServiceKey(v);
                const svc = (services ?? []).find((s) => s.key === v);
                const types = svc?.artifactTypes ?? [];
                // 종류가 1개뿐이면 고르라고 묻지 않고 그 1개를 자동으로 쓴다(§19.1).
                setArtifactTypeKey(types.length === 1 ? types[0].key : '');
                setExternalArtifactId('');
                setTypeErr(false);
              }}
              options={[
                { value: '', label: 'Choose a service…' },
                ...(services ?? []).map((s) => ({ value: s.key, label: s.name })),
              ]}
            />
          </Field>
          {artifactTypes.length > 1 && (
            <Field label="Artifact type — this service provides more than one kind" sx={{ mb: '12px' }}>
              <SelectInput
                value={artifactTypeKey}
                onChange={(v) => { setArtifactTypeKey(v); setTypeErr(false); }}
                options={[
                  { value: '', label: 'Choose one…' },
                  ...artifactTypes.map((t) => ({ value: t.key, label: t.name })),
                ]}
              />
              {typeErr && (
                <Box sx={{ fontSize: 11, color: T.rd, mt: '5px' }}>
                  {selectedService?.name} provides more than one artifact type — pick one.
                </Box>
              )}
            </Field>
          )}
          {serviceKey && (
            <Box sx={{ mb: '12px' }}>
              <ExternalArtifactPicker
                service={selectedService}
                projectCode={project?.code}
                projectRevision={project?.revision}
                value={externalArtifactId}
                onChange={setExternalArtifactId}
              />
            </Box>
          )}
        </>
      )}

      {sourceMode === 'calypso' && (
        <Box sx={{ mb: '12px' }}>
          <CalypsoArtifactPicker
            projectId={project?._id}
            myDepartments={myDepartments}
            value={externalArtifactId}
            onChange={setExternalArtifactId}
          />
        </Box>
      )}
      <SirenButton variant="primary" onClick={submit}>
        <Icon name="check" /> Save
      </SirenButton>

      <Field label="Release schedule" sx={{ mt: '13px', mb: 0 }}>
        {orphan && (
          <Box
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: 11.5, color: T.rd,
              background: T.rd2, border: `1px solid ${T.rd3}`, borderRadius: '8px',
              padding: '8px 10px', mb: '8px', lineHeight: 1.6,
            }}
          >
            <Box component="span" sx={{ mt: '1px' }}><Icon name="warn" size={12} /></Box>
            The phase this artifact was on no longer exists in this workflow's schedule.
          </Box>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {phases.map((p) => (
            <Box
              key={p.id}
              title={`${shortDate(p.start)} → ${shortDate(p.end)}`}
              sx={{
                fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, padding: '4px 9px',
                borderRadius: '7px', cursor: 'default',
                background: relatedPhases.has(p.id) ? T.tl2 : T.sf,
                border: `1px solid ${relatedPhases.has(p.id) ? T.tl : T.ln2}`,
                color: relatedPhases.has(p.id) ? T.tl : T.dm2,
              }}
            >
              {p.name}
            </Box>
          ))}
          {!phases.length && (
            <Box sx={{ fontSize: 12, color: T.rd }}>
              This workflow has no phases — add a schedule first.
            </Box>
          )}
        </Box>
      </Field>
    </Card>
  );
}

/* ── B: Flow links — 읽기 전용 ── */
function FlowLinksCard({
  d, phases, nodes, edges,
}: {
  d: CanvasNode; phases: WorkflowPhase[]; nodes: CanvasNode[];
  edges: ReturnType<typeof useCanvasStore.getState>['edges'];
}) {
  const outs = edges.filter((e) => e.from === d.id);
  const ins = edges.filter((e) => e.to === d.id);

  const edgeRow = (e: { id: string; from: string; to: string }, dir: 'in' | 'out') => {
    const other = nodes.find((x) => x.id === (dir === 'out' ? e.to : e.from));
    if (!other) return null;
    const op = phases.find((p) => p.id === other.phase);
    return (
      <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${T.ln}` }}>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10, color: T.dm2, width: 46, flex: '0 0 46px' }}>
          {dir === 'out' ? '→ Next' : '← Prev'}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{other.name}</Box>
        <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 10, color: op ? T.dm2 : T.rd }}>
          {op?.name ?? 'no schedule'}
        </Box>
      </Box>
    );
  };

  return (
    <Card>
      <Ey sx={{ mb: '9px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Icon name="link" /> Flow links
      </Ey>
      {ins.length + outs.length === 0 ? (
        <Box sx={{ fontSize: 12, color: T.dm2 }}>Not linked to anything yet.</Box>
      ) : (
        <>
          {ins.map((e) => edgeRow(e, 'in'))}
          {outs.map((e) => edgeRow(e, 'out'))}
        </>
      )}
    </Card>
  );
}

/* ── B: 전달 — own = 이 workflow가 만들어 남에게 준다(outgoing) — 전달 받을 부서(+
 * 개별 담당자)만 남긴다(사용자 요청). 탭이 아니라 이 산출물이 받는 게 아닌 이상(own
 * 여부와 무관하게) 항상 보이는 섹션이다. ── */
function HandoffSection({ d, own, onSave }: { d: CanvasNode; own: boolean; onSave: Props['onSaveRecv'] }) {
  const { t } = useTranslation();
  const { resolveUser } = useDirectory();
  const [dept, setDept] = useState(d.recvDept ?? '');
  const [contact, setContact] = useState(d.recvContact ?? '');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  useEffect(() => {
    setDept(d.recvDept ?? ''); setContact(d.recvContact ?? '');
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!own) {
    return (
      <Card>
        <Ey sx={{ mb: '9px' }}>{t('deliverable.recipientDeptTitle')}</Ey>
        {d.recvDept ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0' }}>
            <Badge color={T.dm} bg={T.sf2} borderColor={T.ln}>{departmentName(d.recvDept)}</Badge>
            {d.recvContact && (
              <>
                <UserAvatar user={resolveUser(d.recvContact)} size={24} />
                <Box sx={{ fontSize: 13 }}>{resolveUser(d.recvContact).name}</Box>
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ fontSize: 12.5, color: T.dm2 }}>{t('deliverable.recipientDeptNotSet')}</Box>
        )}
      </Card>
    );
  }

  const contactUser = contact ? resolveUser(contact) : null;

  return (
    <Card>
      <Ey sx={{ mb: '9px' }}>{t('deliverable.recipientDeptTitle')}</Ey>
      <Field label={t('deliverable.departmentLabel')} sx={{ mb: '11px' }}>
        <SelectInput
          value={dept}
          onChange={(v) => { setDept(v); setContact(''); }}
          options={[{ value: '', label: t('deliverable.notSet') }, ...RECEIVABLE_DEPARTMENTS.map((dp) => ({ value: dp.id, label: dp.name }))]}
        />
      </Field>
      <Field label={t('deliverable.individualContact')} sx={{ mb: '9px' }}>
        {contactUser ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 0' }}>
            <UserAvatar user={contactUser} size={24} />
            <Box sx={{ flex: 1, minWidth: 0, fontSize: 13 }}>{contactUser.name}</Box>
            <SirenButton variant="ghost" onClick={() => setContact('')}>
              <Icon name="x" />
            </SirenButton>
          </Box>
        ) : (
          <Box sx={{ fontSize: 12, color: T.dm2, padding: '6px 0' }}>{t('deliverable.notSet')}</Box>
        )}
      </Field>
      <SirenButton onClick={() => setContactSearchOpen(true)}>
        <Icon name="search" /> {contact ? t('deliverable.changeContact') : t('deliverable.setContact')}
      </SirenButton>

      {contactSearchOpen && (
        <UserSearchDialog
          title={t('deliverable.setContactDialogTitle')}
          onClose={() => setContactSearchOpen(false)}
          onConfirm={(knoxId) => { setContact(knoxId); setContactSearchOpen(false); }}
        />
      )}

      <Box sx={{ mt: '12px' }}>
        <SirenButton
          variant="primary"
          onClick={() => onSave({ recvDept: dept || null, recvContact: contact || null })}
        >
          <Icon name="check" /> {t('deliverable.save')}
        </SirenButton>
      </Box>
    </Card>
  );
}
