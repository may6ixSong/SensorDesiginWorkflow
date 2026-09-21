import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { Badge } from '@/components/common/SirenButton';
import { Pager } from '@/components/common/Pager';
import { ProjectChip } from './ProjectChip';
import { UserAvatar } from '@/components/common/Avatar';
import { useDirectory } from '@/app/providers/DirectoryProvider';
import { useMyReleases } from '@/api/hooks/useAssignments';
import { fmtAt } from '@/lib/canvasModel';
import { canonicalDepartmentLabel } from '@/shared/constants/departments';
import { MyReleaseRowDto } from '@/types/domain';
import { CURSOR_POINTER, FONT_MONO, T } from '@/theme/tokens';

/**
 * release 목록 패널 — 받은 것("내가/내 부서가 recipient") 또는 낸 것("내가 실행했거나 내
 * 부서 workflow가 발행")을 최신순으로 (설계서 09장 §1·§2).
 *
 * ★ **한 번에 다 불러오지 않는다.** release는 계속 쌓이기만 하는 기록이라(철회·삭제가
 *   없다 — 05장 §4.5) 전량 조회는 시간이 갈수록 반드시 느려진다. 서버가 인덱스로 한
 *   페이지씩 잘라 주고, 여기서는 페이지 번호만 옮긴다.
 */
export function ReleaseFeedPanel({
  direction, title, onOpen, sx, projectIds,
}: {
  direction: 'received' | 'published';
  title: string;
  onOpen: (row: MyReleaseRowDto) => void;
  sx?: object;
  /** project 필터(Overview 탭 공통 필터, 사용자 요청) — undefined면 전체, 빈 배열이면
   * 아무 project도 고르지 않은 것이라 서버를 부르지 않고 빈 목록으로 둔다. */
  projectIds?: string[];
}) {
  const [page, setPage] = useState(1);
  const projectIdsKey = projectIds?.join(',');
  // project 필터가 바뀌면 이전 필터 기준의 페이지 번호가 새 결과 집합 밖일 수 있어
  // 1페이지로 되돌린다(MyArtifactsPanel의 검색어 처리와 같은 이유).
  useEffect(() => setPage(1), [projectIdsKey]);
  const { data, isLoading, isError, isPlaceholderData } = useMyReleases(direction, page, undefined, projectIds);
  const meta = data?.meta;
  const rows = data?.items ?? [];

  return (
    <Box
      sx={{
        border: `1px solid ${T.ln}`, borderRadius: '14px', background: T.sf,
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
        ...sx,
      }}
    >
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '13px 15px', borderBottom: `1px solid ${T.ln}`, background: T.sf2,
        }}
      >
        <Box
          sx={{
            width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
            background: direction === 'received' ? T.recv : T.pr,
          }}
        />
        <Box sx={{ fontSize: 13, fontWeight: 700 }}>{title}</Box>
        <Box sx={{ flex: 1 }} />
        {meta && (
          <Box sx={{ fontSize: 11, color: T.dm2, fontFamily: FONT_MONO }}>{meta.total}</Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', padding: '9px', minHeight: 190 }}>
        {isError ? (
          <Box sx={{ fontSize: 12, color: T.danger, padding: '22px 8px', textAlign: 'center' }}>
            Could not load releases.
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  height: 62, borderRadius: '10px', border: `1px solid ${T.ln}`, background: T.sf2,
                  animation: 'sirenPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </Box>
        ) : !rows.length ? (
          <Box
            sx={{
              border: `1px dashed ${T.ln2}`, borderRadius: '10px',
              padding: '30px 16px', textAlign: 'center', fontSize: 12, color: T.dm2,
            }}
          >
            {direction === 'received'
              ? 'Nothing has been released to you or your departments yet.'
              : 'You and your departments have not released anything yet.'}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              // 페이지를 넘기는 동안 이전 페이지가 잠깐 남아 있는 것을 눈에 보이게 한다.
              opacity: isPlaceholderData ? 0.55 : 1,
              transition: 'opacity .14s ease',
            }}
          >
            {rows.map((row) => (
              <ReleaseRow key={row.id} row={row} direction={direction} onOpen={() => onOpen(row)} />
            ))}
          </Box>
        )}
      </Box>

      {meta && (
        <Pager
          page={meta.page}
          size={meta.size}
          total={meta.total}
          hasMore={meta.hasMore}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </Box>
  );
}

function ReleaseRow({
  row, direction, onOpen,
}: {
  row: MyReleaseRowDto;
  direction: 'received' | 'published';
  onOpen: () => void;
}) {
  const { resolveUser } = useDirectory();
  const by = resolveUser(row.releasedBy);
  const noteLine = (row.note ?? '').split('\n')[0];

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        textAlign: 'left', width: '100%', fontFamily: 'inherit',
        border: `1px solid ${T.ln}`, borderRadius: '10px', background: T.sf,
        padding: '10px 12px', cursor: CURSOR_POINTER, display: 'block',
        transition: 'background .14s ease, border-color .14s ease',
        '&:hover': { background: T.sf2, borderColor: T.ln2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', mb: '4px' }}>
        {/* title(workflow명)이 이제 이 줄의 첫머리다(사용자 요청) — project명이 있던 그
            자리에 대신 들어간다. project명은 아래 chip으로 옮겨 department보다 강조되게
            (색+굵은 글씨) 보여준다. */}
        <Box sx={{ fontSize: 13.5, fontWeight: 800, color: T.tx, minWidth: 0, overflowWrap: 'anywhere' }}>
          {row.workflowAt.name}
        </Box>
        <Box sx={{ color: T.ln2 }}>·</Box>
        <Box sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: T.pr }}>
          {row.label}
        </Box>
        <ProjectChip projectId={row.projectId} name={row.projectName} />
        <Badge color={T.dm} bg={T.sf3} borderColor={T.ln}>
          {canonicalDepartmentLabel(row.workflowAt.department)}
        </Badge>
        {row.changedCount > 0 && (
          <Badge color={T.warn} bg={T.warnSoft} borderColor={T.warnLine}>
            {row.changedCount} CHANGED
          </Badge>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 10.5, color: T.dm2, fontFamily: FONT_MONO }}>{fmtAt(row.releasedAt)}</Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
        <UserAvatar user={by} size={17} />
        <Box sx={{ fontSize: 11, color: T.dm }}>{by?.name ?? row.releasedBy}</Box>
        <Box sx={{ fontSize: 11, color: T.dm2 }}>·</Box>
        <Box sx={{ fontSize: 11, color: T.dm2 }}>
          {row.itemCount} artifact{row.itemCount === 1 ? '' : 's'}
        </Box>
        {/* 받은 쪽에서는 "내 어느 부서가 받았는가"가 곧 이 줄이 왜 나에게 왔는지의 설명이다. */}
        {direction === 'received' && row.myRecipientDepartments.length > 0 && (
          <Box sx={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {row.myRecipientDepartments.map((d) => (
              <Badge key={d} color={T.recv} bg={T.recvSoft} borderColor={T.recv}>
                {canonicalDepartmentLabel(d)}
              </Badge>
            ))}
          </Box>
        )}
      </Box>

      {noteLine && (
        <Box
          sx={{
            fontSize: 11.5, color: T.dm, mt: '5px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {noteLine}
        </Box>
      )}
    </Box>
  );
}
