import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { UserDto } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';

/** 사용자 스위처 목록 (설계서 1.3 - 목업 단계는 SSO 대신 사용자 스위처). */
export function useSwitchableUsers() {
  return useQuery({
    queryKey: queryKeys.switchableUsers,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<UserDto[]>>('/auth/switchable-users');
      return res.data.data;
    },
  });
}

// TODO: SSO 연동 지점 - devLogin() 대신 IdP 콜백으로 세션을 초기화하도록 교체.
export function useDevLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.post<ApiEnvelope<{ accessToken: string; user: UserDto }>>(
        '/auth/dev-login',
        { userId },
      );
      return res.data.data;
    },
    onSuccess: ({ accessToken, user }) => {
      useAuthStore.getState().setSession(accessToken, user);
      qc.invalidateQueries();
    },
  });
}
