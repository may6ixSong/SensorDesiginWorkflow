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
    mutationFn: async (
      payload: {
        name: string; phaseId: string; intent?: 'own' | 'received';
        artifactKey?: string | null; serviceKey?: string | null; externalArtifactId?: string | null;
      },
    ) => {
      const res = await apiClient.post<ApiEnvelope<DeliverableDto>>(`/workflows/${workflowId}/deliverables`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateDeliverables(qc, workflowId),
  });
}

export function useUpdateDeliverable(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { id, ...patch }: {
        id: string; name?: string; artifactKey?: string;
        serviceKey?: string | null; externalArtifactId?: string | null;
      },
    ) => {
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
 * recvWorkflowId·sourceDept·sourceContact는 더 이상 이 엔드포인트로 고칠 수 없다(사용자
 * 요청 — 전달 탭은 전달 받을 부서만 남긴다).
 */
export function useUpdateRecv(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, recvDept, recvContact,
    }: {
      id: string; recvDept: string | null; recvContact: string | null;
    }) => {
      const res = await apiClient.patch<ApiEnvelope<DeliverableDto>>(`/deliverables/${id}/recv`, {
        recvDept,
        recvContact,
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
 * C/D 티어 수동 버전 기록 (Hub 설계서 §9) — POST /deliverables/:id/versions.
 *
 * 실물을 소유한 서비스가 붙어 있는 산출물(serviceKey != null)은 BE가 이 경로를
 * 거절한다(assertManualArtifact). 아직 연동되지 않은 출처로부터 "이 버전을 받았다"를
 * 기록하는 자리이고, 덮어쓰기 없이 append-only로 쌓인다.
 */
export function useAssertVersion(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, ...body
    }: {
      id: string;
      versionLabel?: string;
      isReleased?: boolean;
      tier?: 'A' | 'B' | 'C' | 'D';
      hpcPath?: string;
      giverDept?: string;
      viewUrl?: string;
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
