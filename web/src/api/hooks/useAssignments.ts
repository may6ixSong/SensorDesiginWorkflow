import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import { queryKeys } from '../queryKeys';
import {
  CalendarDto,
  MyArtifactRowDto,
  MyReleaseRowDto,
  PagedDto,
  ReleaseDto,
} from '@/types/domain';

/**
 * My Assignment (설계서 09장) — 과제 경계를 넘어 "내 일"만 모아 오는 조회들.
 *
 * 서버가 이미 scope(내가 member인 과제 → 내 부서가 소속 부서인 workflow → 그 workflow의
 * own block)로 좁혀 주므로, 여기서는 projectId 같은 걸 넘기지 않는다.
 */

const PAGE_SIZE = 10;

export function useMyReleases(direction: 'received' | 'published', page: number) {
  return useQuery({
    queryKey: queryKeys.myReleases(direction, page),
    // 페이지를 넘길 때 목록이 빈 화면으로 깜빡이지 않게 이전 페이지를 잠깐 유지한다.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiClient.get<PagedDto<MyReleaseRowDto>>(`/my/releases/${direction}`, {
        params: { page, size: PAGE_SIZE },
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
