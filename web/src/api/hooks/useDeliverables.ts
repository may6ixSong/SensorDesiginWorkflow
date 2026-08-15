import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { DeliverableDto, DeliverableVersionDto } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';

/** 캔버스 편집 중에는 refetch를 중단한다 (설계서 7.1). */
export function useDeliverables(ipId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.isEditing);
  return useQuery({
    queryKey: queryKeys.deliverables(ipId ?? ''),
    enabled: Boolean(ipId) && !isEditing,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<DeliverableDto[]>>(`/ips/${ipId}/deliverables`);
      return res.data.data;
    },
  });
}

export function useDeliverableVersions(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.deliverableVersions(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<DeliverableVersionDto[]>>(`/deliverables/${id}/versions`);
      return res.data.data;
    },
  });
}

function invalidateDeliverables(qc: ReturnType<typeof useQueryClient>, ipId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.deliverables(ipId) });
}

export function useCreateDeliverable(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; phaseKey: string; docType: string; network: 'OA' | 'HPC' }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/ips/${ipId}/deliverables`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, ipId),
  });
}

export function useUpdateDeliverable(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; docType?: string; network?: 'OA' | 'HPC' }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}`, patch);
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, ipId),
  });
}

export function useDeleteDeliverable(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/deliverables/${id}`);
      return id;
    },
    onSuccess: () => invalidateDeliverables(qc, ipId),
  });
}

/** BE가 recvDept(Analog 제외)와 recvContact.department===recvDept를 다시 검증한다 (설계서 3.4). */
export function useUpdateRecv(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, recvDept, recvContact }: { id: string; recvDept: string | null; recvContact: string | null }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/recv`, {
        recvDept,
        recvContact,
      });
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, ipId),
  });
}

/** Release 일정(series) 갱신 (설계서 3.6). */
export function useUpdateSchedule(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, phaseKeys }: { id: string; phaseKeys: string[] }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto[]>>(`/deliverables/${id}/schedule`, {
        phaseKeys,
      });
      return res.data.data;
    },
    onSuccess: () => {
      invalidateDeliverables(qc, ipId);
      qc.invalidateQueries({ queryKey: queryKeys.edges(ipId) });
    },
  });
}

export function useUploadUrl() {
  return useMutation({
    mutationFn: async ({ id, fileName, contentType }: { id: string; fileName: string; contentType: string }) => {
      const res = await apiClient.post(`/deliverables/${id}/upload-url`, { fileName, contentType });
      return res.data.data as { uploadUrl: string; storageKey: string; method: 'PUT'; headers: Record<string, string> };
    },
  });
}

export function useAddVersion(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      storageKey?: string;
      hpcPath?: string;
      fileName: string;
      note?: string;
    }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/versions`, body);
      return res.data.data;
    },
    onSuccess: (d) => {
      invalidateDeliverables(qc, ipId);
      qc.invalidateQueries({ queryKey: queryKeys.deliverableVersions(d.id) });
    },
  });
}

export function useRelease(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/release`, { note });
      return res.data.data;
    },
    onSuccess: (d) => {
      invalidateDeliverables(qc, ipId);
      qc.invalidateQueries({ queryKey: queryKeys.deliverableVersions(d.id) });
    },
  });
}
