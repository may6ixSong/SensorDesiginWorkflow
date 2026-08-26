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
export function useDeliverables(workflowId: string | undefined) {
  const isEditing = useCanvasStore((s) => s.edit);
  return useQuery({
    queryKey: queryKeys.deliverables(workflowId ?? ''),
    enabled: Boolean(workflowId) && !isEditing,
    refetchInterval: isEditing ? false : 8000,
    queryFn: async () => {
      const res = await apiClient.get<DeliverablesListResponse>(`/workflows/${workflowId}/deliverables`);
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

function invalidateDeliverables(qc: ReturnType<typeof useQueryClient>, workflowId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.deliverables(workflowId) });
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
    predicate: (query) => query.queryKey[0] === 'workflows' && query.queryKey[2] === 'deliverables',
  });
}

export function useCreateDeliverable(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; phaseId: string; docType: string; network: 'OA' | 'HPC' }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/workflows/${workflowId}/deliverables`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, workflowId),
  });
}

export function useUpdateDeliverable(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; docType?: string; network?: 'OA' | 'HPC' }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}`, patch);
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, workflowId),
  });
}

export function useDeleteDeliverable(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/deliverables/${id}`);
      return id;
    },
    onSuccess: () => invalidateDeliverables(qc, workflowId),
  });
}

/**
 * BE가 recvDept(Analog 제외)와 recvContact.department===recvDept를 다시 검증한다 (설계서 3.4).
 * recvIpId는 이 산출물을 받아야 하는 다른 Analog workflow — 설정하면 그 IP의 보드에
 * Incoming으로 즉시 노출된다.
 */
export function useUpdateRecv(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, recvDept, recvContact, recvWorkflowId, sourceDept,
    }: {
      id: string; recvDept: string | null; recvContact: string | null; recvWorkflowId?: string | null;
      sourceDept?: string | null;
    }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/recv`, {
        recvDept,
        recvContact,
        recvWorkflowId,
        sourceDept,
      });
      return res.data.data;
    },
    onSuccess: () => {
      invalidateDeliverables(qc, workflowId);
      invalidateAllDeliverables(qc);
    },
  });
}

/** Release 일정(series) 갱신 (설계서 3.6). */
export function useUpdateSchedule(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, phaseIds }: { id: string; phaseIds: string[] }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto[]>>(`/deliverables/${id}/schedule`, {
        phaseIds,
      });
      return res.data.data;
    },
    onSuccess: () => {
      invalidateDeliverables(qc, workflowId);
      qc.invalidateQueries({ queryKey: queryKeys.edges(workflowId) });
    },
  });
}

/**
 * 파일 업로드 (S3 presigned URL 대신 api/가 바이트를 직접 중계한다).
 * POST /deliverables/:id/upload — multipart/form-data, 파일 필드명은 "file" 고정.
 * 응답의 storageKey/fileName을 그대로 useAddVersion에 넘겨 버전을 만든다(2단계 플로우).
 */
export function useUploadFile() {
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiEnvelope<{ storageKey: string; fileName: string }>>(
        `/deliverables/${id}/upload`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
  });
}

/**
 * 특정 버전의 파일 바이트를 받아온다.
 * GET /deliverables/:id/download?major=&minor= — 응답은 파일 그 자체(blob).
 */
export async function fetchDeliverableFile(id: string, major: number, minor: number): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/deliverables/${id}/download`, {
    params: { major, minor },
    responseType: 'blob',
  });
  return res.data;
}

/** 위 다운로드를 브라우저 저장까지 처리하는 헬퍼 — UI의 "Download file" 버튼용. */
export function useDownloadVersion() {
  return useMutation({
    mutationFn: async ({
      id, major, minor, fileName,
    }: { id: string; major: number; minor: number; fileName?: string | null }) => {
      const blob = await fetchDeliverableFile(id, major, minor);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `${id}-v${major}.${minor}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function useAddVersion(workflowId: string) {
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
      invalidateDeliverables(qc, workflowId);
      qc.invalidateQueries({ queryKey: queryKeys.deliverableVersions(d.id) });
    },
  });
}

/**
 * Release는 major 버전을 올려 recvDept/recvIpId로 지정된 수신자에게 새 버전을
 * 노출시키는 행위이므로, 이 IP뿐 아니라 모든 IP의 deliverables 쿼리를 무효화해
 * 수신 측 workflow 보드가 열려 있어도(또는 다음에 열 때) 즉시 최신 Release 버전이 보이게 한다.
 */
export function useRelease(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/release`, { note });
      return res.data.data;
    },
    onSuccess: (d) => {
      invalidateDeliverables(qc, workflowId);
      invalidateAllDeliverables(qc);
      qc.invalidateQueries({ queryKey: queryKeys.deliverableVersions(d.id) });
    },
  });
}
