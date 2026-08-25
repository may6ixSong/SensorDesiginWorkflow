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
 * Edit 권한(owners) 추가. api/는 knoxId만 받고 사용자 정보를 조회할 수 없으므로
 * department를 함께 보내고, BE가 그 값이 "analog"인지 다시 검증한다 (설계서 3.3, 6.2).
 * FE 셀렉트 박스의 Analog 필터링은 UX 편의일 뿐 실제 방어는 아니다.
 */
export function useAddOwner(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { knoxId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<IpDto>>(`/ips/${ipId}/owners`, payload);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useRemoveOwner(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.delete<ApiEnvelope<IpDto>>(`/ips/${ipId}/owners/${knoxId}`);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useAddViewGrant(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { knoxId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<IpDto>>(`/ips/${ipId}/view-grants`, payload);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}

export function useRemoveViewGrant(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.delete<ApiEnvelope<IpDto>>(`/ips/${ipId}/view-grants/${knoxId}`);
      return res.data.data;
    },
    onSuccess: (ip) => qc.setQueryData(queryKeys.ip(ipId), ip),
  });
}
