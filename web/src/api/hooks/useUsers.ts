import { useMemo } from 'react';
import { DirectoryUser, MOCK_USERS } from '@/shared/constants/mock-users';

/**
 * recvContact 후보 등 부서별 사용자 조회.
 *
 * api/는 더 이상 사용자 디렉토리를 갖고 있지 않다(KnoxID 문자열만 주고받는다).
 * TODO: 목업 — shared/constants/mock-users.ts의 임시 디렉토리를 사용한다.
 * 실제로는 전사 공통 플랫폼 사용자 API(USER_GROUP_API)로 조회해야 한다.
 *
 * FE 필터링은 UX 편의일 뿐이며, 실제 부서 검증(예: viewGrant의 department)은
 * BE가 다시 수행한다 (설계서 1.3 핵심 보안 원칙).
 */
export function useUsers(department?: string) {
  const data = useMemo<DirectoryUser[]>(
    () => (department ? MOCK_USERS.filter((u) => u.department === department) : MOCK_USERS),
    [department],
  );
  return { data };
}
