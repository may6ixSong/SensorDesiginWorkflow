import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { Milestone, WorkflowDto, WorkflowPhase } from '@/types/domain';

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

/** workflow의 이름/설명(/색상)을 고친다. 값을 보내지 않은 필드는 그대로 유지된다. */
export function useUpdateWorkflow(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; description?: string; color?: string }) => {
      const res = await apiClient.patch<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}`, patch);
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflowId), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(workflow.projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflowDirectory(workflow.projectId) });
    },
  });
}

/**
 * 이 workflow만의 일정을 통째로 교체한다 — 추가/삭제/개명/재일정, 그리고 서로 겹치는
 * 일정까지 전부 허용된다. id를 비워 보내면 새 phase, 보내지 않은 기존 id는 삭제다.
 *
 * ★ 지워진 phase를 가리키던 산출물은 서버가 건드리지 않는다(옮기지도, 지우지도 않는다).
 *   그 산출물은 캔버스의 원래 좌표에 남아 "일정 유실"로 표시된다 — 그래서 여기서
 *   deliverables 쿼리도 함께 무효화해 캔버스가 곧바로 그 상태를 다시 그리게 한다.
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
      qc.invalidateQueries({ queryKey: queryKeys.deliverables(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.memos(workflowId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(workflow.projectId) });
    },
  });
}

/** 과제 마일스톤을 이 workflow의 일정으로 다시 복사하기 위한 입력값(이름/날짜만 가져온다). */
export function milestonesAsPhases(milestones: Milestone[]): { name: string; start: string; end: string }[] {
  return milestones.map((m) => ({ name: m.name, start: m.start, end: m.end }));
}

/** 지금 phase 목록을 그대로 수정 폼에 넣기 위한 변환(그대로지만 의도를 이름으로 남긴다). */
export function phasesAsInput(phases: WorkflowPhase[]): { id: string; name: string; start: string; end: string }[] {
  return phases.map((p) => ({ id: p.id, name: p.name, start: p.start, end: p.end }));
}

/**
 * Edit 권한(owners) 추가. api/는 knoxId만 받고 사용자 정보를 조회할 수 없으므로
 * department를 함께 보내고, BE가 그 값이 "analog"인지 다시 검증한다 (설계서 3.3, 6.2).
 * FE 셀렉트 박스의 Analog 필터링은 UX 편의일 뿐 실제 방어는 아니다.
 */
export function useAddOwner(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { knoxId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/owners`, payload);
      return res.data.data;
    },
    onSuccess: (workflow) => qc.setQueryData(queryKeys.workflow(workflowId), workflow),
  });
}

export function useRemoveOwner(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.delete<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/owners/${knoxId}`);
      return res.data.data;
    },
    onSuccess: (workflow) => qc.setQueryData(queryKeys.workflow(workflowId), workflow),
  });
}

export function useAddViewGrant(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { knoxId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/view-grants`, payload);
      return res.data.data;
    },
    onSuccess: (workflow) => qc.setQueryData(queryKeys.workflow(workflowId), workflow),
  });
}

export function useRemoveViewGrant(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.delete<ApiEnvelope<WorkflowDto>>(`/workflows/${workflowId}/view-grants/${knoxId}`);
      return res.data.data;
    },
    onSuccess: (workflow) => qc.setQueryData(queryKeys.workflow(workflowId), workflow),
  });
}
