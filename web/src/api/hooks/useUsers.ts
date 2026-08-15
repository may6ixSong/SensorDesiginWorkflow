import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { UserDto } from '@/types/domain';

/**
 * recvContact 후보 등 부서별 사용자 조회.
 * FE 필터링은 UX 편의일 뿐이며, 실제 부서 검증(예: recvContact.department===recvDept)은
 * BE가 다시 수행한다 (설계서 1.3 핵심 보안 원칙).
 */
export function useUsers(department?: string) {
  return useQuery({
    queryKey: queryKeys.users(department),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<UserDto[]>>('/users', { params: { department } });
      return res.data.data;
    },
  });
}
