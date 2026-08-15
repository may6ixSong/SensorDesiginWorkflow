import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { IpDto } from '@/types/domain';

export function useIp(ipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ip(ipId ?? ''),
    enabled: Boolean(ipId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<IpDto>>(`/ips/${ipId}`);
      return res.data.data;
    },
  });
}

/**
 * Edit 권한(owners) 추가. BE가 user.department==="analog"를 다시 검증한다 (설계서 3.3, 6.2).
 * FE 셀렉트 박스의 Analog 필터링은 UX 편의일 뿐 실제 방어는 아니다.
 */
export function useAddOwner(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.post<ApiEnvelope<IpDto>>(`/ips/${ipId}/owners`, { userId });
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useRemoveOwner(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete<ApiEnvelope<IpDto>>(`/ips/${ipId}/owners/${userId}`);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useAddViewGrant(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { userId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<IpDto>>(`/ips/${ipId}/view-grants`, payload);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useRemoveViewGrant(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete<ApiEnvelope<IpDto>>(`/ips/${ipId}/view-grants/${userId}`);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}
