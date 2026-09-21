import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import {
  CalendarDto,
  MyArtifactRowDto,
  MyReleaseRowDto,
  PagedDto,
  ReleaseDto,
  ReleaseFeedbackDto,
  ReleaseFeedbackStatus,
} from '@/types/domain';

/**
 * My Assignment (설계서 09장) — 과제 경계를 넘어 "내 일"만 모아 오는 조회들.
 *
 * 서버가 이미 scope(내가 member인 과제 → 내 부서가 소속 부서인 workflow → 그 workflow의
 * own node)로 좁혀 주므로, 여기서는 projectId 같은 걸 넘기지 않는다.
 */

const DEFAULT_PAGE_SIZE = 5;

/**
 * @param size 기본 5(My Assignment의 Inbox/Outbox 패널, 사용자 요청). bell 팝업처럼 더 큰
 *   페이지가 필요한 호출부는 직접 넘긴다 — 페이지 크기가 다르면 다른 조회이므로 쿼리
 *   키에도 함께 담는다(queryKeys.myReleases).
 * @param projectIds project 필터(legend 체크박스, 사용자 요청) — `undefined`면 필터
 *   없음(전체), 빈 배열이면 "0개 선택"이라 서버를 부르지 않고 그대로 빈 결과로 둔다.
 */
export function useMyReleases(
  direction: 'received' | 'published',
  page: number,
  size = DEFAULT_PAGE_SIZE,
  projectIds?: string[],
) {
  const noProjectSelected = projectIds !== undefined && projectIds.length === 0;
  return useQuery({
    queryKey: queryKeys.myReleases(direction, page, size, projectIds),
    enabled: !noProjectSelected,
    // 페이지를 넘길 때 목록이 빈 화면으로 깜빡이지 않게 이전 페이지를 잠깐 유지한다.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiClient.get<PagedDto<MyReleaseRowDto>>(`/my/releases/${direction}`, {
        params: { page, size, projectIds: projectIds?.length ? projectIds.join(',') : undefined },
      });
      return res.data;
    },
  });
}

/**
 * bell 아이콘 전용 — 받은 release 최근 N건을 스크롤 목록 하나로 보여준다(My Assignment의
 * Inbox 패널과 달리 페이지 넘김 UI가 없다 — 알림 팝업다운 "최근 N개"면 충분하다).
 * 같은 값으로 안읽음 배지도 계산한다.
 *
 * ★ 쿼리 키에 **clientId**를 직접 담는다 — `useMyReleases`의 키는 그러지 않아서, Admin이
 *   사용자 시뮬레이터로 신원을 바꿔도 리액트 쿼리가 이전 신원의 캐시를 그대로 들고 있을
 *   수 있다(호출 자체는 apiClient의 전역 헤더로 나가므로 정확한 사람 것이 오지만, 캐시
 *   키가 같으면 새로 부르지 않고 옛 결과를 재사용해 버린다). bell은 "시뮬레이션한 사람
 *   본인처럼 보여야 한다"는 요구가 명시적이라, 신원이 바뀌는 순간 다른 쿼리로 보이게
 *   키에 넣어 확실히 재조회시킨다.
 * ★ 60초마다 다시 불러 배지가 새 release에 어느 정도 실시간으로 반응하게 한다 — SIREN에는
 *   아직 release 전용 실시간 push가 없다(05장 §6.4 TODO T3).
 */
export function useMyReceivedFeed(clientId: string, size = 30) {
  return useQuery({
    queryKey: ['my', 'releases', 'received', 'feed', clientId, size] as const,
    enabled: Boolean(clientId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await apiClient.get<PagedDto<MyReleaseRowDto>>('/my/releases/received', {
        params: { page: 1, size },
      });
      return res.data;
    },
  });
}

/** 내 부서가 주는 산출물 — 최근 1년, 최근 갱신순. 서버가 창을 자르므로 페이지가 없다. */
export function useMyArtifacts() {
  return useQuery({
    queryKey: queryKeys.myArtifacts,
    queryFn: async () => {
      const res = await apiClient.get<MyArtifactRowDto[]>('/my/artifacts');
      return res.data;
    },
  });
}

/**
 * 달력 한 화면.
 *
 * ★ from/to는 **FE가 실제로 그리는 격자의 경계**다(로컬 시간대 기준). 서버에 연/월만
 *   넘기면 서버 시간대로 환산되면서 월초·월말 하루가 어긋난다.
 */
export function useMyCalendar(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.myCalendar(from, to),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiClient.get<CalendarDto>('/my/calendar', { params: { from, to } });
      return res.data;
    },
  });
}

/**
 * release 한 건의 상세. 목록/달력에서 행을 눌러 다이얼로그를 열 때만 부른다 — 산출물별
 * 마스킹 판정이 이 호출 안에서 돌기 때문에 목록을 그릴 때 미리 당겨오지 않는다.
 */
export function useRelease(releaseId: string | null) {
  return useQuery({
    queryKey: queryKeys.release(releaseId ?? ''),
    enabled: Boolean(releaseId),
    queryFn: async () => {
      const res = await apiClient.get<ReleaseDto>(`/releases/${releaseId}`);
      return res.data;
    },
  });
}

/**
 * release 한 건에 대해 한 부서가 남긴 댓글 스레드(설계서 09장 §4.2~4.3) — 산출물 단위가
 * 아니라 release 전체에 대한 것이다. department가 바뀌면 완전히 다른 조회다 — 다른 부서
 * 것과 섞이지 않도록 쿼리 키에 그대로 담는다.
 */
export function useReleaseFeedback(releaseId: string, department: string) {
  return useQuery({
    queryKey: queryKeys.releaseFeedback(releaseId, department),
    enabled: Boolean(releaseId) && Boolean(department),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<ReleaseFeedbackDto[]>>(
        `/releases/${releaseId}/feedback`,
        { params: { department } },
      );
      return res.data.data;
    },
  });
}

export function useCreateReleaseFeedback(releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      department: string;
      comment: string;
      /** 답글일 때만. 최상위 댓글은 생략한다. */
      parentId?: string;
      /** 최상위 댓글에서만 의미가 있다 — 생략하면 서버가 accepted(초록)로 채운다. */
      status?: ReleaseFeedbackStatus;
    }) => {
      const res = await apiClient.post<ReleaseFeedbackDto>(`/releases/${releaseId}/feedback`, input);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.releaseFeedback(releaseId, variables.department) });
    },
  });
}
