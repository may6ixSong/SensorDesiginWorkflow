import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress, Stack } from '@mui/material';
import { AppShell } from '@/components/layout/AppShell';
import { ArtifactSlide } from '@/components/dialogs/ArtifactSlide';
import { Card, Ey } from '@/components/common/Panel';
import { SirenButton } from '@/components/common/SirenButton';
import { Icon } from '@/components/common/Icon';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useProject, useProjectWorkflows, useProjects } from '@/api/hooks/useProjects';
import { useWorkflow } from '@/api/hooks/useWorkflow';
import { useBlocks, useReplaceBlockRecipients } from '@/api/hooks/useBlocks';
import { useReleases, useReleasePreview } from '@/api/hooks/useReleases';
import { useArtifactServices } from '@/api/hooks/useHub';
import { useComments } from '@/api/hooks/useComments';
import { downloadCalypsoVersion } from '@/api/calypsoClient';
import { toast } from '@/store/toastStore';
import { fmtAt } from '@/lib/canvasModel';
import { canEditWorkflow, myDepartments as myDeptsOf } from '@/lib/access';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { ArtifactDto, BlockDto, MaskedArtifactDto, ReleaseItemDto, isMaskedArtifact } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, R, T, TIER_COLOR, TIER_LABEL, TNUM } from '@/theme/tokens';

type OpenTab = 'overview' | 'recipients' | 'comments';

/**
 * Release 이력 — 예전에는 팝업(ReleaseHistoryDialog)이었다. 페이지로 바꿔서 특정 release를
 * URL로 공유할 수 있게 하고, artifact 목록을 OA/HPC 망으로 나눈 표로 다시 짰다(사용자 요청).
 */
export function ReleaseHistoryPage() {
  const { projectId, workflowId, releaseId } = useParams<{ projectId: string; workflowId: string; releaseId?: string }>();
  const navigate = useNavigate();
  const { resolveUser } = useDirectory();
  const { user: me, isAdmin } = useAuth();

  const { data: projects } = useProjects();
  const { data: project } = useProject(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
  const { data: blocks } = useBlocks(workflowId);
  const releases = useReleases(workflowId);
  const services = useArtifactServices();
  const replaceRecipients = useReplaceBlockRecipients(workflowId ?? '');

  const canEdit = canEditWorkflow(workflow, isAdmin);
  /** Edit 권한자에게만 "Current"(최신 release 이후 지금 상태)를 보여준다 — 이 미리보기는
   * release 실행과 같은 로직으로 계산되고, 서버도 edit 권한만 허용한다(설계서 05장 §4.4). */
  const preview = useReleasePreview(workflowId, canEdit);
  /** canEdit는 클라이언트가 캐시된 workflow.myAccess로 판단한 값일 뿐이다 — 시뮬레이션
   * 전환이나 캐시 staleness로 실제와 어긋날 수 있으므로, 서버가 이 미리보기를 실제로
   * 403으로 거부했다면(=진짜 edit 권한이 아님) 그 판정을 최종으로 따른다. */
  const previewForbidden = preview.isError && (preview.error as any)?.response?.status === 403;
  const canShowCurrent = canEdit && !previewForbidden;

  /** 이 페이지 안에서만 쓰는 slide 상태 — canvasStore(openId)를 안 쓴다. 캔버스로 이동하지
   * 않고 그 자리에서 상세를 띄우고, 닫으면 이 Release 페이지 상태(선택된 release 등)가
   * 그대로 유지되게 하기 위함(사용자 요청). */
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<OpenTab | undefined>(undefined);
  /** null이면 전체. 고르면 그 부서가 recipient로 잡힌 항목만 남긴다(기존 팝업의 부서 필터
   * 그대로, 사용자 요청). */
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const myDepartments = useMemo(
    () => myDeptsOf(project, me?.KnoxID, isAdmin),
    [project, me?.KnoxID, isAdmin],
  );
  const openBlock = useMemo(() => (blocks ?? []).find((b) => b.id === openBlockId) ?? null, [blocks, openBlockId]);

  const blockById = useMemo(() => new Map((blocks ?? []).map((b) => [b.id, b])), [blocks]);
  const serviceNameByKey = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.key, s.name])),
    [services.data],
  );

  const sorted = useMemo(() => [...(releases.data ?? [])].sort((a, b) => b.seq - a.seq), [releases.data]);
  /** URL이 'current'를 가리켜도 Edit 권한이 없으면 절대 보여주지 않는다 - 서버도 이 미리보기를
   * edit 권한자에게만 허용하고(useReleasePreview의 enabled도 canEdit일 때만 켜진다), 렌더
   * 조건도 항상 이 값 하나로만 판단해서 "권한 없어도 Current 화면 자체가 보이는" 구멍을
   * 없앤다. */
  const requestedCurrent = releaseId === 'current';
  const showCurrent = requestedCurrent && canShowCurrent;
  const selected = !showCurrent && releaseId && releaseId !== 'current' ? sorted.find((r) => r.id === releaseId) ?? null : null;

  // URL에 releaseId가 없으면 정규화한다 - Edit 권한자는 항상 Current를 기본으로 보고(사용자
  // 요청), 그 외에는 최신 release로 보낸다. 이 페이지의 URL이 늘 특정 대상을 가리키게 해서
  // (공유 가능) 팝업과 달리 페이지로 바꾼 실익을 살린다.
  useEffect(() => {
    if (releaseId || !projectId || !workflowId) return;
    if (canEdit) {
      navigate(`/details/${projectId}/${workflowId}/releases/current`, { replace: true });
    } else if (sorted.length > 0) {
      navigate(`/details/${projectId}/${workflowId}/releases/${sorted[0].id}`, { replace: true });
    }
  }, [releaseId, sorted, projectId, workflowId, canEdit, navigate]);

  // Edit 권한 없이 /releases/current로 들어오면(URL 직접 입력·공유된 링크, 또는 canEdit가
  // 클라이언트에서 잘못 true로 보였다가 서버가 403으로 정정한 경우) 최신 release로, 그것도
  // 없으면 release 없는 기본 화면으로 되돌린다. `canShowCurrent`(서버 403까지 반영한 값)
  // 기준으로 판단해야 그 정정된 케이스도 놓치지 않는다.
  useEffect(() => {
    if (!requestedCurrent || canShowCurrent || !projectId || !workflowId) return;
    if (sorted.length > 0) {
      navigate(`/details/${projectId}/${workflowId}/releases/${sorted[0].id}`, { replace: true });
    } else {
      navigate(`/details/${projectId}/${workflowId}/releases`, { replace: true });
    }
  }, [requestedCurrent, canShowCurrent, sorted, projectId, workflowId, navigate]);

  const openArtifact = (blockId: string, tab?: OpenTab) => {
    setOpenBlockId(blockId);
    setOpenTab(tab);
  };
  const closeArtifact = () => {
    setOpenBlockId(null);
    setOpenTab(undefined);
  };

  if (workflowLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ height: '100vh' }}>
        <CircularProgress />
      </Stack>
    );
  }

  // Current(미리보기)는 masked 개념이 없다 - 이 미리보기 자체가 edit 권한자에게만 오므로
  // 항상 false로 채워 기존 ReleaseItemDto 파이프라인(표/행 컴포넌트)을 그대로 재사용한다.
  const currentItems: ReleaseItemDto[] = (preview.data?.items ?? []).map((i) => ({ ...i, masked: false }));
  const displayedItems = (showCurrent ? currentItems : (selected?.items ?? [])).filter(
    (i) => !deptFilter || i.recipients.departments.includes(deptFilter),
  );

  const oaItems = displayedItems
    .filter((i) => i.network === 'OA')
    .sort((a, b) => a.artifactName.localeCompare(b.artifactName));
  const hpcItems = displayedItems
    .filter((i) => i.network === 'HPC')
    .sort((a, b) => a.artifactName.localeCompare(b.artifactName));

  return (
    <AppShell
      projects={projects ?? []}
      projectId={projectId}
      onChangeProject={(id) => navigate(`/details/${id}`)}
      workflows={workflows ?? []}
      workflowId={workflowId}
      onChangeIp={(id) => navigate(`/details/${projectId}/${id}`)}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 24px', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '16px', flexShrink: 0 }}>
          <SirenButton variant="ghost" onClick={() => navigate(`/details/${projectId}/${workflowId}`)}>
            <Icon name="undo" size={13} /> Back to canvas
          </SirenButton>
          <Box sx={{ width: 1, height: 18, background: T.ln }} />
          <Ey>Release History</Ey>
          <Box sx={{ fontSize: 17, fontWeight: 700 }}>{workflow?.name}</Box>

          <Box sx={{ flex: 1 }} />

          {/* 부서별 필터 — "우리 부서가 받은 것"만 본다(기존 팝업의 부서 필터, 사용자 요청). */}
          <Box
            component="select"
            value={deptFilter ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDeptFilter(e.target.value || null)}
            sx={{
              fontSize: 11.5, padding: '4px 8px', borderRadius: `${R.xs}px`,
              border: `1px solid ${T.ln2}`, background: T.sf, color: T.tx,
              cursor: CURSOR_POINTER, fontFamily: 'inherit',
              '& option': { background: T.sf, color: T.tx },
            }}
          >
            <option value="">All recipients</option>
            {(project?.departments ?? []).map((d) => (
              <option key={d} value={d}>{canonicalDepartmentLabel(d)}</option>
            ))}
          </Box>
        </Box>

        {sorted.length === 0 && !showCurrent ? (
          <Box sx={{ padding: '44px 16px', textAlign: 'center', color: T.dm2, fontSize: 13 }}>
            No release yet.
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: '18px', flex: 1, minHeight: 0 }}>
            {/* 좌측 — release 목록 (Current는 실제 edit 권한자에게만, 맨 위에 고정) */}
            <Box sx={{ width: 240, flexShrink: 0, overflowY: 'auto' }}>
              {canShowCurrent && (
                <Box
                  component="button"
                  onClick={() => navigate(`/details/${projectId}/${workflowId}/releases/current`)}
                  sx={{
                    display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                    background: showCurrent ? T.prSoft : T.sf2,
                    border: `1px solid ${showCurrent ? T.prLine : T.ln}`,
                    borderRadius: `${R.sm}px`, padding: '9px 10px', mb: '10px', cursor: CURSOR_POINTER,
                    '&:hover': { background: showCurrent ? T.prSoft : T.sf3 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
                    <Box sx={{ fontSize: 13, fontWeight: 700, color: showCurrent ? T.pr : T.tx }}>Current</Box>
                  </Box>
                  <Box sx={{ fontSize: 11, color: T.dm, mt: '3px' }}>
                    Live state since {sorted[0]?.label ?? 'the start'}
                    {(preview.data?.changedCount ?? 0) > 0 && (
                      <Box component="span" sx={{ color: T.warn }}> · {preview.data?.changedCount} changed</Box>
                    )}
                  </Box>
                </Box>
              )}
              {sorted.map((r) => {
                const on = r.id === selected?.id;
                const changedCount = r.items.filter((i) => i.changed).length;
                return (
                  <Box
                    key={r.id}
                    component="button"
                    onClick={() => navigate(`/details/${projectId}/${workflowId}/releases/${r.id}`)}
                    sx={{
                      display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                      background: on ? T.prSoft : 'transparent',
                      border: `1px solid ${on ? T.prLine : 'transparent'}`,
                      borderRadius: `${R.sm}px`, padding: '9px 10px', mb: '5px', cursor: CURSOR_POINTER,
                      '&:hover': { background: on ? T.prSoft : T.sf2 },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                      <Box sx={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: on ? T.pr : T.tx, ...TNUM }}>
                        {r.label}
                      </Box>
                      <Box sx={{ fontSize: 11, color: T.dm2, ...TNUM }}>{fmtAt(r.releasedAt).slice(0, 10)}</Box>
                    </Box>
                    <Box sx={{ fontSize: 11, color: T.dm, mt: '3px', ...TNUM }}>
                      {r.items.length} artifacts
                      {changedCount > 0 && <Box component="span" sx={{ color: T.warn }}> · {changedCount} changed</Box>}
                    </Box>
                    {r.note && (
                      <Box sx={{ fontSize: 11, color: T.dm2, mt: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.note}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* 우측 — 선택된 release(또는 Current)의 artifact 표 */}
            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
              {showCurrent ? (
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center', gap: '8px', mb: '16px',
                    fontSize: 12.5, color: T.dm, lineHeight: 1.6, background: T.okSoft,
                    border: `1px solid ${T.okLine}`, borderRadius: `${R.sm}px`, padding: '9px 11px',
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: T.ok, flexShrink: 0 }} />
                  <Box>
                    Not released yet — this is the live state of every artifact in this workflow right now,
                    compared against {sorted[0]?.label ?? 'the last release'}.
                  </Box>
                </Box>
              ) : selected && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mb: '10px', flexWrap: 'wrap' }}>
                    <Box sx={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: T.pr, ...TNUM }}>
                      {selected.label}
                    </Box>
                    <Box sx={{ fontSize: 11.5, color: T.dm2, ...TNUM }}>{fmtAt(selected.releasedAt)}</Box>
                    <UserAvatar user={resolveUser(selected.releasedBy)} size={20} />
                    <Box sx={{ fontSize: 11.5, color: T.dm }}>
                      {resolveUser(selected.releasedBy)?.name ?? selected.releasedBy}
                    </Box>
                  </Box>

                  {selected.note && (
                    <Box
                      sx={{
                        fontSize: 12.5, color: T.tx2, lineHeight: 1.6, background: T.sf2,
                        border: `1px solid ${T.ln}`, borderRadius: `${R.sm}px`, padding: '9px 11px', mb: '16px',
                      }}
                    >
                      {selected.note}
                    </Box>
                  )}
                </>
              )}

              {(showCurrent || selected) && (
                <>
                  <ArtifactGroup
                    title="OA"
                    items={oaItems}
                    blockById={blockById}
                    serviceNameByKey={serviceNameByKey}
                    workflowId={workflowId ?? ''}
                    projectId={projectId ?? ''}
                    onOpen={openArtifact}
                  />
                  <Box sx={{ height: '18px' }} />
                  <ArtifactGroup
                    title="HPC"
                    items={hpcItems}
                    blockById={blockById}
                    serviceNameByKey={serviceNameByKey}
                    workflowId={workflowId ?? ''}
                    projectId={projectId ?? ''}
                    onOpen={openArtifact}
                  />
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {openBlock && (
        <ArtifactSlide
          block={openBlock}
          own={canEdit}
          project={project}
          myDepartments={myDepartments}
          phases={workflow?.phases ?? []}
          onClose={closeArtifact}
          initialTab={openTab}
          releases={releases.data ?? []}
          onOpenRelease={(releaseId2) => {
            closeArtifact();
            navigate(`/details/${projectId}/${workflowId}/releases/${releaseId2}`);
          }}
          saving={replaceRecipients.isPending}
          onSaveRecipients={(p) =>
            replaceRecipients.mutate(
              { blockId: openBlock.id, ...p },
              {
                onSuccess: () => toast('Recipients saved'),
                onError: (e: any) => toast(e?.response?.data?.message ?? 'Failed to save recipients'),
              },
            )
          }
        />
      )}
    </AppShell>
  );
}

function ArtifactGroup({
  title, items, blockById, serviceNameByKey, workflowId, projectId, onOpen,
}: {
  title: string;
  items: ReleaseItemDto[];
  blockById: Map<string, BlockDto>;
  serviceNameByKey: Map<string, string>;
  workflowId: string;
  projectId: string;
  onOpen: (blockId: string, tab?: OpenTab) => void;
}) {
  return (
    <Card>
      <Ey sx={{ mb: '10px' }}>{title} ({items.length})</Ey>
      {items.length === 0 ? (
        <Box sx={{ padding: '14px 4px', color: T.dm2, fontSize: 12.5 }}>No artifacts.</Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex', gap: '10px', padding: '4px 8px', fontSize: 10.5, fontWeight: 700,
              color: T.dm2, textTransform: 'uppercase', letterSpacing: '.05em',
            }}
          >
            <Box sx={{ flex: '2 1 0', minWidth: 0 }}>Artifact</Box>
            <Box sx={{ flex: '1 1 0', minWidth: 0 }}>Access</Box>
            <Box sx={{ width: 80, flexShrink: 0 }}>Version</Box>
            <Box sx={{ width: 130, flexShrink: 0 }}>Updated</Box>
            <Box sx={{ flex: '2 1 0', minWidth: 0 }}>Comments</Box>
          </Box>
          {items.map((item) => (
            <ArtifactRow
              key={item.blockId}
              item={item}
              artifact={blockById.get(item.blockId)?.artifact}
              serviceNameByKey={serviceNameByKey}
              workflowId={workflowId}
              projectId={projectId}
              onOpen={onOpen}
            />
          ))}
        </Box>
      )}
    </Card>
  );
}

function ArtifactRow({
  item, artifact, serviceNameByKey, workflowId, projectId, onOpen,
}: {
  item: ReleaseItemDto;
  artifact: ArtifactDto | MaskedArtifactDto | null | undefined;
  serviceNameByKey: Map<string, string>;
  workflowId: string;
  projectId: string;
  onOpen: (blockId: string, tab?: OpenTab) => void;
}) {
  const tier = TIER_COLOR[item.tier];
  const liveArtifact = artifact && !isMaskedArtifact(artifact) ? artifact : null;
  const badgeLabel = item.tier === 'A' && liveArtifact?.serviceKey
    ? (serviceNameByKey.get(liveArtifact.serviceKey) ?? TIER_LABEL[item.tier])
    : TIER_LABEL[item.tier];

  return (
    <Box
      onClick={() => onOpen(item.blockId)}
      sx={{
        display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 8px',
        // 직전 release 대비 바뀐 항목은 배경색으로 눈에 띄게 — 예전 팝업(HistoryRow)과 같은
        // 표기(T.changed/T.changedLine)를 그대로 쓴다.
        background: item.changed ? T.changed : 'transparent',
        borderTop: `1px solid ${item.changed ? T.changedLine : T.ln}`,
        cursor: CURSOR_POINTER,
        '&:hover': { background: item.changed ? T.changed : T.sf2 },
      }}
    >
      <Box sx={{ flex: '2 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
        {item.masked ? (
          <Box sx={{ color: T.dm2, display: 'inline-flex', flexShrink: 0 }} title="No access">
            <Icon name="lock" size={12} />
          </Box>
        ) : (
          <Box
            sx={{
              fontSize: 10, fontWeight: 700, color: tier.fg, background: tier.bg,
              padding: '2px 6px', borderRadius: `${R.xs}px`, flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            {badgeLabel}
          </Box>
        )}
        <Box
          sx={{
            fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', color: item.masked ? T.dm2 : T.tx,
          }}
        >
          {item.artifactName}
        </Box>
      </Box>

      <Box sx={{ flex: '1 1 0', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
        {!item.masked && <AccessCell item={item} artifact={liveArtifact} projectId={projectId} />}
      </Box>

      <Box sx={{ width: 80, flexShrink: 0, fontFamily: FONT_MONO, fontSize: 12, ...TNUM }}>
        {item.published?.versionLabel ?? '—'}
      </Box>

      <Box sx={{ width: 130, flexShrink: 0, fontSize: 11.5, color: T.dm2, ...TNUM }}>
        {item.published?.publishedAt ? fmtAt(item.published.publishedAt) : '—'}
      </Box>

      <Box sx={{ flex: '2 1 0', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
        {!item.masked && (
          <LatestCommentCell workflowId={workflowId} blockId={item.blockId} onOpen={() => onOpen(item.blockId, 'comments')} />
        )}
      </Box>
    </Box>
  );
}

/**
 * 종류별 데이터 접근(사용자 요청): HPC path는 복사, Calypso가 관리하는 실제 파일은 다운로드,
 * 그 외 URL은 새 창 링크. 우선순위는 ArtifactSlide의 VersionList와 동일하게 맞춘다.
 */
function AccessCell({ item, artifact, projectId }: { item: ReleaseItemDto; artifact: ArtifactDto | null; projectId: string }) {
  const v = item.published;
  const [downloading, setDownloading] = useState(false);

  if (!v) return <Box sx={{ fontSize: 12, color: T.dm2 }}>—</Box>;

  if (v.hpcPath) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%' }}>
        <Box
          sx={{
            fontFamily: FONT_MONO, fontSize: 11, color: T.dm2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title={v.hpcPath}
        >
          {v.hpcPath}
        </Box>
        <SirenButton
          variant="ghost"
          title="Copy path"
          sx={{ minWidth: 0, padding: '2px', flexShrink: 0 }}
          onClick={() => {
            navigator.clipboard?.writeText(v.hpcPath as string);
            toast('Path copied');
          }}
        >
          <Icon name="copy" size={12} />
        </SirenButton>
      </Box>
    );
  }

  const isCalypsoFile = artifact?.serviceKey === 'calypso' && !!artifact.externalArtifactId && !!v.versionRef;
  if (isCalypsoFile) {
    return (
      <SirenButton
        variant="ghost"
        sx={{ fontSize: 11.5 }}
        disabled={downloading}
        onClick={async () => {
          setDownloading(true);
          try {
            const { blob, filename } = await downloadCalypsoVersion(artifact!.externalArtifactId as string, projectId, v.versionRef as string);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename ?? `${item.artifactName}-${v.versionLabel}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          } catch {
            toast('Download failed');
          } finally {
            setDownloading(false);
          }
        }}
      >
        <Icon name="dn" size={12} /> {downloading ? 'Downloading…' : 'Download'}
      </SirenButton>
    );
  }

  if (v.viewUrl) {
    return (
      <Box
        component="a"
        href={v.viewUrl}
        target="_blank"
        rel="noreferrer"
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: 11.5, color: T.pr, textDecoration: 'none', fontWeight: 600,
        }}
      >
        <Icon name="link" size={12} /> Open
      </Box>
    );
  }

  return <Box sx={{ fontSize: 12, color: T.dm2 }}>—</Box>;
}

function LatestCommentCell({ workflowId, blockId, onOpen }: { workflowId: string; blockId: string; onOpen: () => void }) {
  const comments = useComments(workflowId, blockId);
  const latest = comments.data && comments.data.length > 0 ? comments.data[comments.data.length - 1] : undefined;

  return (
    <Box
      onClick={onOpen}
      title={latest?.text}
      sx={{
        cursor: CURSOR_POINTER, fontSize: 12, color: latest ? T.tx2 : T.dm2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      {latest ? latest.text : 'No comments yet.'}
    </Box>
  );
}
