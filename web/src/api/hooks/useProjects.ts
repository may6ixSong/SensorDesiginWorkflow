import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { WorkflowBriefDto, WorkflowDto, Milestone, ProjectDetailDto, ProjectDto } from '@/types/domain';

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<ProjectDto[]>>('/projects');
      return res.data.data;
    },
  });
}

/** Project Information 페이지용 상세(마일스톤 + 부서별 팀원 로스터). */
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}`);
      return res.data.data;
    },
  });
}

/**
 * 과제 공통 일정(마일스톤) 목록 교체 — 추가/삭제/개명/재일정 전부 가능하다. id를 비워
 * 보내면 새 마일스톤이다.
 *
 * 이미 만들어진 workflow의 phase는 여기서 바꿔도 따라 바뀌지 않는다 — workflow는 생성
 * 시점에 마일스톤을 "복사"해 자기 것으로 들고 있기 때문이다(사용자 선택: 완전 소유).
 * 과제 일정에 다시 맞추고 싶으면 그 workflow에서 "Reset to project milestones"를 쓴다.
 */
export function useUpdateMilestones(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (milestones: { id?: string; name: string; start: string; end: string }[]) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/milestones`,
        { milestones },
      );
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projectMilestones(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/**
 * 이 과제의 부서 목록 교체 — 목록 전체를 보낸다(workflow-domains와 같은 방식). 산출물
 * "Received from" 화면의 후보 목록이라 workflow-domains와 달리 사용 중이어도 자유롭게
 * 지울 수 있다(BE가 막지 않는다).
 */
export function useUpdateProjectDepartments(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (departments: string[]) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/departments`,
        { departments },
      );
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/**
 * workflow 하나를 부서에 재배정한다 (빈 문자열이면 배정 해제) — unassigned 상태를 고치거나
 * 다른 부서로 옮길 때 쓴다. 요청하는 사람 본인이 그 부서에 속해 있어야 BE가 받아준다.
 * projectWorkflows를 반드시 무효화해야 한다 — 그 목록이 Design Workflow view의
 * buildDomainModel 입력이라, 여기서 안 갱신하면 우주 지도의 항성계가 예전 부서로 남는다.
 */
export function useUpdateWorkflowDomain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, domain }: { workflowId: string; domain: string }) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/workflows/${workflowId}/domain`,
        { domain },
      );
      return { project: res.data.data, workflowId };
    },
    onSuccess: ({ project, workflowId }) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
    },
  });
}

/**
 * 과제 팀원(부서별 로스터)에 인원을 추가한다 — 이 과제의 workflow 중 하나라도 Edit 권한이
 * 있어야 한다(BE 재검증). 이미 있는 멤버를 다른 부서 카드에서 추가하면 그 부서가 명단에
 * 더해진다(한 멤버가 여러 부서에 속할 수 있다).
 */
export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { knoxId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}/members`, payload);
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

/** 멤버를 지정한 부서 카드에서 뺀다 — 그 부서가 마지막 소속이었으면 명단에서 완전히 사라진다. */
export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ knoxId, department }: { knoxId: string; department: string }) => {
      const res = await apiClient.delete<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/members/${knoxId}`,
        { params: { department } },
      );
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

/**
 * Project Manager 추가 — 마일스톤(공통 일정)을 수정할 수 있는 사람. Workflow owners(Edit
 * 권한)와는 별개 role이라 department 없이 knoxId만 받는다.
 */
export function useAddProjectManager(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.post<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}/managers`, { knoxId });
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

export function useRemoveProjectManager(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (knoxId: string) => {
      const res = await apiClient.delete<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}/managers/${knoxId}`);
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

/** 과제 공통 일정(마일스톤) 조회 — 수정은 useUpdateMilestones 참고. */
export function useProjectMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectMilestones(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<Milestone[]>>(`/projects/${projectId}/milestones`);
      return res.data.data;
    },
  });
}

/**
 * 새 workflow를 만든다 — phase는 서버가 이 과제의 마일스톤을 복사해 채워 준다(사용자 요청:
 * "default로는 과제의 milestone이 들어가고"). 만든 사람이 곧 대표 담당자가 되므로 바로
 * 편집할 수 있다. domain은 만드는 사람이 이 과제에서 실제로 속한 부서 중 하나여야 하며
 * (BE가 재검증), creatorIsAdmin은 소속 부서가 하나도 없는 admin이 예외적으로 unassigned
 * workflow를 만들 수 있게 하는 신호다.
 */
export function useCreateWorkflow(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string; domain: string; creatorIsAdmin?: boolean; description?: string; color?: string;
    }) => {
      const res = await apiClient.post<ApiEnvelope<WorkflowDto>>(`/projects/${projectId}/workflows`, payload);
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflow.id), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflowDirectory(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

/** Edit 또는 View 권한이 있는 workflow만 반환 (설계서 5.1). */
export function useProjectWorkflows(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectWorkflows(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<WorkflowDto[]>>(`/projects/${projectId}/workflows`);
      return res.data.data;
    },
  });
}

/**
 * 과제 소속 workflow 전체를 가볍게(id/name/color) 반환한다 — 개인 접근 권한과 무관하게
 * 산출물의 "수신 workflow"를 지정하는 셀렉트 박스에서 쓴다.
 */
export function useProjectWorkflowDirectory(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectWorkflowDirectory(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<WorkflowBriefDto[]>>(`/projects/${projectId}/workflow-directory`);
      return res.data.data;
    },
  });
}
