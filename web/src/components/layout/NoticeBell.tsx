import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, Popover, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/common/Icon';
import { Badge } from '@/components/common/SirenButton';
import { UserAvatar } from '@/components/common/Avatar';
import { ProjectChip } from '@/components/assignment/ProjectChip';
import { ProjectFilterLegend } from '@/components/assignment/ProjectFilterLegend';
import { ReleaseDetailDialog } from '@/components/assignment/ReleaseDetailDialog';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useMyReceivedFeed } from '@/api/hooks/useAssignments';
import { useProjects } from '@/api/hooks/useProjects';
import { useSignalRNotice } from '@/hooks/useSignalRNotice';
import { getReadReleaseIds, RELEASE_READ_EVENT } from '@/lib/releaseReadTracker';
import { useProjectFilter } from '@/lib/projectFilter';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';
import type { Notice } from '@/types/notice';
import type { MyReleaseRowDto } from '@/types/domain';

/** "안 읽음"의 대상 자체를 최근 N일 release로만 한정한다(사용자 확정) — 그보다 오래된
 * release는 실제로 열어본 적이 없어도 배지에 영영 남아 쌓이지 않는다. */
const UNREAD_WINDOW_DAYS = 10;
/** 팝업에 보여줄 최근 release 개수 — My Assignment의 Inbox처럼 페이지를 넘기지 않는다,
 * 알림 팝업은 "최근 몇 개"면 충분하다(사용자 요청: "release 받은 목록"). */
const FEED_SIZE = 30;
/** 팝업 상단 project legend겸 필터(사용자 요청) — 다음 접속에도 이어간다. */
const PROJECT_FILTER_COOKIE = 'siren-notice-bell-project-filter';

/**
 * app bar의 bell — **release 알림 전용**으로 바뀌었다(사용자 요청). 이 프로젝트의
 * "notice"는 두 갈래로 나뉜다:
 *
 *   1. **내가/내 부서가 recipient로 받은 workflow release** — 이 bell의 본체다. 클릭하면
 *      최근 목록을 보여주고(부서·workflow·누가·언제만, note는 빼고), 행을 누르면 그
 *      release의 상세(ReleaseDetailDialog)가 연다. 그 다이얼로그가 열리는 순간이 "확인함"의
 *      기준이다(설계서 09장, ReleaseDetailDialog 주석 참고).
 *   2. **플랫폼 긴급 공지(SYSTEM_API의 SignalR emergencyNotice)** — 화면 어디에도 상시
 *      목록/배지를 두지 않는다. **처음 접속 시 목록을 당겨오는 API 호출 자체를 하지
 *      않는다**(사용자 요청) — 대신 SignalR push가 실제로 올 때만, 그 push가 이미 실어
 *      보낸 내용(title/content)을 그대로 다이얼로그로 띄운다. 그래서 추가 조회가 전혀
 *      없다 — "긴급 notice는 계속 수신"이 이 최소한의 형태로 유지된다.
 *
 * 배지 숫자는 (1)의 안 읽은 개수다 — 최근 {@link UNREAD_WINDOW_DAYS}일 안의 release 중
 * `releaseReadTracker`(브라우저 쿠키, 2주 보관)에 없는 것만 센다. 사용자 시뮬레이터로
 * 다른 사람 신원이 되면(clientId가 그 사람의 KnoxID로 바뀐다) 그 사람 몫의 release와
 * 그 사람 몫의 읽음 기록을 그대로 보여준다(쿠키 네임스페이스와 쿼리 키 둘 다 clientId로
 * 나뉜다 — useMyReceivedFeed 참고).
 */
export function NoticeBell({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const { resolveUser } = useDirectory();

  const [open, setOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<MyReleaseRowDto | null>(null);
  const [emergency, setEmergency] = useState<Notice | null>(null);

  const { data, isLoading, isError } = useMyReceivedFeed(clientId, FEED_SIZE);
  // data?.items ?? []를 매 렌더 새 배열로 만들면 아래 두 useMemo가 매번 다시 돈다 —
  // data가 실제로 바뀔 때만 참조가 바뀌도록 여기서 한 번 고정한다.
  const releases = useMemo(() => data?.items ?? [], [data]);

  // legend겸 filter다(사용자 요청) — 배지 숫자(unreadCount)는 전체 기준을 유지하고,
  // 필터는 팝업에 "보이는" 목록만 좁힌다.
  const { data: projects = [] } = useProjects();
  const { excludedIds: excludedProjectIds, toggle: toggleProjectFilter } = useProjectFilter(PROJECT_FILTER_COOKIE);

  // 쿠키는 리액트 상태가 아니라서, 읽음 이벤트가 뜰 때마다(다른 release를 열어 확인
  // 처리될 때) 이 값을 다시 계산해 배지를 즉시 갱신한다.
  const [readVersion, setReadVersion] = useState(0);
  useEffect(() => {
    const handler = () => setReadVersion((v) => v + 1);
    window.addEventListener(RELEASE_READ_EVENT, handler);
    return () => window.removeEventListener(RELEASE_READ_EVENT, handler);
  }, []);

  const { unreadCount, unreadIds } = useMemo(() => {
    const cutoff = Date.now() - UNREAD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const readIds = getReadReleaseIds(clientId);
    const ids = new Set(
      releases
        .filter((r) => new Date(r.releasedAt).getTime() >= cutoff && !readIds.has(r.id))
        .map((r) => r.id),
    );
    return { unreadCount: ids.size, unreadIds: ids };
    // readVersion은 값 자체를 쓰지 않고 재계산 트리거로만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases, clientId, readVersion]);

  /** 안 읽은 것을 맨 위로, 그다음은 최신 release 순이다(사용자 요청) — 서버는 이미
   * releasedAt 내림차순으로 주므로, 안읽음/읽음 두 그룹으로만 다시 나눈다(그룹 안에서는
   * 이미 정렬된 순서가 그대로 유지된다 — Array.sort는 안정 정렬이다). */
  const sortedReleases = useMemo(
    () => [...releases].sort((a, b) => Number(unreadIds.has(b.id)) - Number(unreadIds.has(a.id))),
    [releases, unreadIds],
  );

  const visibleReleases = useMemo(
    () => sortedReleases.filter((r) => !excludedProjectIds.has(r.projectId)),
    [sortedReleases, excludedProjectIds],
  );

  useSignalRNotice({
    enabled: Boolean(import.meta.env.SYSTEM_API),
    clientId,
    systemApiBaseUrl: import.meta.env.SYSTEM_API,
    // push가 이미 title/content를 실어 보내므로 추가 조회 없이 그대로 띄운다 — "처음
    // 접속 시 불러오는 API"를 없앤 것과 같은 방향이다(불필요한 호출을 만들지 않는다).
    onEmergencyNotice: (notice) => setEmergency(notice),
  });

  const openRelease = (row: MyReleaseRowDto) => {
    setOpen(false);
    setSelectedRelease(row);
  };

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <Box
          component="button"
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          aria-label="Released to me"
          title="Released to me"
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '8px',
            background: open ? T.sf3 : T.sf, color: open ? T.tx : T.dm,
            border: 'none', outline: 'none', cursor: CURSOR_POINTER, transition: '.14s',
            '&:hover': { background: T.sf3, color: T.tx },
          }}
        >
          <Icon name="bell" size={18} />
        </Box>
        {unreadCount > 0 && (
          <Box
            sx={{
              position: 'absolute', top: '-1px', right: '-1px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '14px', height: '14px', px: '2px',
              background: '#E82C1F', border: '0.5px solid #F73529', borderRadius: '999px',
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '9px', lineHeight: 1, letterSpacing: '0.5px', color: '#fff', fontWeight: 700 }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Typography>
          </Box>
        )}
      </Box>

      <Popover
        open={open}
        anchorEl={btnRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: 1, width: 460, maxHeight: 560, border: `1px solid ${T.ln}`, borderRadius: '14px',
            // Paper 자신은 스크롤하지 않는다(사용자 요청) — 스크롤은 아래 release 목록
            // 하나에만 있으면 된다. flex column으로 감싸 목록 쪽만 남는 공간을 먹게 한다.
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          },
        }}
      >
        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px', px: '16px', py: '12px', borderBottom: `1px solid ${T.ln}` }}>
          <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>Inbox</Typography>
          <Typography sx={{ fontSize: 11, color: T.dm2 }}>released to me or my departments</Typography>
        </Box>

        {/* legend겸 filter(사용자 요청) — project별 색을 name 기준으로 구분해 보여주고,
            체크를 끄면 아래 목록에서 그 project가 빠진다. */}
        {Boolean(projects.length) && (
          <Box sx={{ flex: '0 0 auto', px: '16px', py: '10px', borderBottom: `1px solid ${T.ln}` }}>
            <ProjectFilterLegend
              projects={projects}
              excludedIds={excludedProjectIds}
              onToggle={toggleProjectFilter}
              direction="horizontal"
              dense
            />
          </Box>
        )}

        {/* 스크롤은 이 영역 하나에만 둔다(사용자 요청) — Paper 자체는 overflow:hidden이라
            더 이상 바깥쪽에 겹쳐 뜨는 스크롤바가 없다. */}
        <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {isError ? (
            <Typography sx={{ px: 2, py: 3, fontSize: 12.5, color: T.danger, textAlign: 'center' }}>
              Could not load releases.
            </Typography>
          ) : isLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px', p: '10px' }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    height: 52, borderRadius: '10px', border: `1px solid ${T.ln}`, background: T.sf2,
                    animation: 'sirenPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.16}s`,
                  }}
                />
              ))}
            </Box>
          ) : releases.length === 0 ? (
            <Typography sx={{ px: 2, py: 4, fontSize: 12.5, color: T.dm, textAlign: 'center' }}>
              Nothing has been released to you or your departments yet.
            </Typography>
          ) : visibleReleases.length === 0 ? (
            <Typography sx={{ px: 2, py: 4, fontSize: 12.5, color: T.dm, textAlign: 'center' }}>
              No releases match the selected projects.
            </Typography>
          ) : (
            <Box sx={{ p: '8px' }}>
              {visibleReleases.map((row) => (
                <ReleaseFeedRow
                  key={row.id}
                  row={row}
                  unread={unreadIds.has(row.id)}
                  unreadLabel={t('appShell.notices.unread')}
                  onOpen={() => openRelease(row)}
                  resolveUser={resolveUser}
                />
              ))}
            </Box>
          )}
        </Box>
      </Popover>

      {selectedRelease && (
        <ReleaseDetailDialog row={selectedRelease} onClose={() => setSelectedRelease(null)} />
      )}

      <Dialog open={Boolean(emergency)} onClose={() => setEmergency(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>{emergency?.title}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{emergency?.content}</Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * project name · 부서 · workflow · 누가 · 언제 — note도, 산출물 수도, changed 배지도 없다
 * (사용자 요청: "간략하게"). 자세한 내용은 눌러서 상세 다이얼로그에서 본다.
 *
 * ★ 안 읽음은 이제 작은 점 하나로 두지 않는다 — 붉은 점 + "Unread" 칩을 함께 써서 확실히
 *   구별되게 한다(사용자 요청). 칩 문구는 시스템 언어를 따른다.
 */
function ReleaseFeedRow({
  row, unread, unreadLabel, onOpen, resolveUser,
}: {
  row: MyReleaseRowDto;
  unread: boolean;
  unreadLabel: string;
  onOpen: () => void;
  resolveUser: ReturnType<typeof useDirectory>['resolveUser'];
}) {
  const by = resolveUser(row.releasedBy);
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: '9px', width: '100%',
        textAlign: 'left', fontFamily: 'inherit', border: 'none', background: 'transparent',
        borderRadius: '10px', padding: '9px 8px', cursor: CURSOR_POINTER,
        '&:hover': { background: T.sf2 },
      }}
    >
      <Box
        sx={{
          width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', mt: '6px',
          background: unread ? T.danger : 'transparent',
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', mb: '2px' }}>
          {/* title(workflow명)이 이제 맨 앞이다(사용자 요청) — project명이 있던 자리를
              대신 차지한다. */}
          <Box sx={{ fontSize: 13, fontWeight: unread ? 800 : 700, color: T.tx, minWidth: 0, overflowWrap: 'anywhere' }}>
            {row.workflowAt.name}
          </Box>
          {unread && (
            <Badge color={T.danger} bg={T.dangerSoft} borderColor={T.dangerLine}>{unreadLabel}</Badge>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: T.pr }}>{row.label}</Box>
          {/* project명과 department의 자리를 서로 바꿨다(사용자 요청) — project는 chip
              형태로 department보다 굵게 써서 더 눈에 띄게 한다. */}
          <ProjectChip projectId={row.projectId} name={row.projectName} size="sm" />
          <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
            {canonicalDepartmentLabel(row.workflowAt.department)}
          </Badge>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '4px' }}>
          <UserAvatar user={by} size={16} />
          <Box sx={{ fontSize: 11, color: T.dm }}>{by?.name ?? row.releasedBy}</Box>
          <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(row.releasedAt)}</Box>
        </Box>
      </Box>
    </Box>
  );
}
