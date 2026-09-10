import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { AccessGrant, CanvasLockDto, WorkflowDto } from '@/types/domain';

export function useWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workflow(workflowId ?? ''),
    enabled: Boolean(workflowId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}`);
      return res.data.data;
    },
  });
}

/**
 * Name / Description / Department를 **한 번에** 저장한다(설계서 02장 §7.2).
 *
 * 화면의 Save 버튼이 하나이므로 API도 하나다. Department가 바뀌면 서버가 editAccess의
 * 부서 교체까지 같이 처리하므로, 성공 후 workflow 캐시만 갱신하면 권한 목록도 최신이 된다.
 */
export function useUpdateWorkflow(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; description?: string; department?: string; color?: string }) => {
      const res = await apiClient.patch<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}`, patch);
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflowId), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(workflow.projectId) });
      // 부서가 바뀌면 각 블록의 권한 판정 결과도 달라질 수 있다.
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
    },
  });
}

/**
 * 권한 한 벌 통째 교체 (설계서 01장 §3.3).
 *
 * ★ workflow 소속 부서의 Edit Access 항목은 서버가 다시 넣으므로, 클라이언트가 실수로
 *   빼고 보내도 삭제되지 않는다. 화면에서도 그 항목에는 삭제 버튼을 그리지 않는다.
 * ★ Edit과 View 동시 등록을 허용한다 — 어느 쪽도 상대에서 제거하지 않는다.
 */
export function useReplaceWorkflowAccess(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { editAccess: AccessGrant; viewAccess: AccessGrant }) => {
      const res = await apiClient.put<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/access`, input);
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflowId), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(workflow.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
    },
  });
}

/**
 * 이 workflow만의 일정을 통째로 교체한다 — 추가/삭제/개명/재일정, 서로 겹치는 일정까지
 * 전부 허용된다. id를 비워 보내면 새 phase, 보내지 않은 기존 id는 삭제다.
 *
 * ★ 지워진 phase를 가리키던 블록은 서버가 건드리지 않는다(옮기지도, 지우지도 않는다).
 *   그 블록은 캔버스의 원래 좌표에 남아 "일정 유실"로 표시되므로, 여기서 blocks 쿼리도
 *   함께 무효화해 캔버스가 곧바로 그 상태를 다시 그리게 한다.
 * ★ 이 요청은 canvasLock과 무관하다 — 누가 캔버스를 편집 중이어도 일정은 바뀔 수 있다.
 */
export function useUpdateWorkflowPhases(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phases: { id?: string; name: string; start: string; end: string }[]) => {
      const res = await apiClient.patch<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/phases`, { phases });
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflowId), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.blocks(workflowId) });
    },
  });
}

/* ------------------------------------------------------------------ *
 * 캔버스 편집 lock (설계서 03장 §3)
 * ------------------------------------------------------------------ */

export interface CanvasLockResult extends CanvasLockDto {
  ttlMs: number;
  renewed: boolean;
}

/**
 * 점유 또는 갱신(하트비트). 남이 살아 있는 lock을 들고 있으면 409가 온다 —
 * 호출부가 그 상태를 잡아 "○○○님이 편집 중"을 그린다.
 */
export function useAcquireCanvasLock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiEnvelope<CanvasLockResult>>(`/workflows/${workflowId}/canvas-lock`);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}

/** 해제. 본인 또는 Admin(강제 해제)만 가능하다. */
export function useReleaseCanvasLock(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete<ApiEnvelope<{ released: boolean }>>(
        `/workflows/${workflowId}/canvas-lock`,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}
