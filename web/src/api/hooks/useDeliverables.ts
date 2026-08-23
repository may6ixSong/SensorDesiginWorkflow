import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { DeliverableDto, DeliverableVersionDto, DeliverablesListResponse } from '@/types/domain';
import { useCanvasStore } from '@/store/canvasStore';

/**
 * 캔버스 편집 중에는 refetch를 중단한다 (설계서 7.1).
 * `data.data` = 이 IP가 주는 산출물(own), `data.incoming` = 다른 IP로부터 받는 산출물 —
 * 항상 Release 버전만 담겨 온다. refetchInterval로 다른 IP가 release()한 결과를
 * 화면을 벗어나지 않아도 짧은 주기 안에 반영한다("바로 업데이트"의 목업 근사).
 */
export function useDeliverables(ipId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.edit);
  return useQuery({
    queryKey: queryKeys.deliverables(ipId ?? ''),
    enabled: Boolean(ipId) && !isEditing,
    refetchInterval: isEditing ? false : 8000,
    queryFn: async () => {
      const res = await apiClient.get<DeliverablesListResponse>(`/ips/${ipId}/deliverables`);
      return res.data;
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

/**
 * recvIpId로 다른 IP를 지정할 수 있게 된 뒤로는, 이 IP에서의 release/recv 변경이
 * "어느 IP의 incoming 목록"에 영향을 주는지 클라이언트가 미리 알 수 없다(그 IP를
 * 알려면 대상 산출물을 다시 읽어야 한다). 그래서 모든 IP의 deliverables 쿼리를
 * 무효화해 — 지금 열려 있는 다른 보드가 있다면 즉시, 아니면 다음에 그 보드를 열 때
 * 최신 상태로 반영되게 한다.
 */
function invalidateAllDeliverables(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'ips' && query.queryKey[2] === 'deliverables',
  });
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

/**
 * BE가 recvDept(Analog 제외)와 recvContact.department===recvDept를 다시 검증한다 (설계서 3.4).
 * recvIpId는 이 산출물을 받아야 하는 다른 Analog IP — 설정하면 그 IP의 보드에
 * Incoming으로 즉시 노출된다.
 */
export function useUpdateRecv(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, recvDept, recvContact, recvIpId, sourceDept,
    }: {
      id: string; recvDept: string | null; recvContact: string | null; recvIpId?: string | null;
      sourceDept?: string | null;
    }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/recv`, {
        recvDept,
        recvContact,
        recvIpId,
        sourceDept,
      });
      return res.data.data;
    },
    onSuccess: () => {
      invalidateDeliverables(qc, ipId);
      invalidateAllDeliverables(qc);
    },
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

/**
 * Release는 major 버전을 올려 recvDept/recvIpId로 지정된 수신자에게 새 버전을
 * 노출시키는 행위이므로, 이 IP뿐 아니라 모든 IP의 deliverables 쿼리를 무효화해
 * 수신 측 IP 보드가 열려 있어도(또는 다음에 열 때) 즉시 최신 Release 버전이 보이게 한다.
 */
export function useRelease(ipId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/release`, { note });
      return res.data.data;
    },
    onSuccess: (d) => {
      invalidateDeliverables(qc, ipId);
      invalidateAllDeliverables(qc);
      qc.invalidateQueries({ queryKey: queryKeys.deliverableVersions(d.id) });
    },
  });
}
