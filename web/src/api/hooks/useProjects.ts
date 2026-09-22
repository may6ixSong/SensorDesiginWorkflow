import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { WorkflowDto, Milestone, ProjectDetailDto, ProjectDto } from '@/types/domain';

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
 * 과제 메타데이터(이름/code/revision) 수정 — code+revision 조합에만 유니크 제약이
 * 걸려 있다(Hub 설계서 §19.3). status는 이 화면에서 건드리지 않는다 — 전달하지 않으면
 * 서버가 기존 값을 그대로 둔다.
 */
export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; code?: string; revision?: string }) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}`, payload);
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/**
 * 부서 관리 — 추가 / 이름 변경 / 삭제를 **항목 단위**로 부른다(02장 §9.3).
 *
 * ★ 예전의 "목록 전체를 배열로 교체"(`PATCH :id/departments`) 방식은 폐지했다. 부서가
 *   `{id, name}`이 되면서 id는 한 번 발급되면 절대 바뀌지 않아야 하는데, 배열 통째 교체는
 *   어느 항목이 어느 항목의 후신인지 서버가 알 수 없어 id를 새로 발급해 버리기 때문이다 —
 *   그러면 그 부서를 참조하던 workflow/node/artifact 권한이 전부 끊긴다.
 * ★ 세 훅 모두 응답으로 갱신된 project 전체를 받아 캐시에 그대로 덮는다. 그래서 이름을
 *   바꾸면 그 캐시를 읽는 모든 화면(`useDepartmentLabel`)의 라벨이 **추가 요청 없이** 즉시
 *   따라온다.
 */
export function useAddDepartment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/departments`,
        { name },
      );
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** 부서명 변경 — id는 그대로 두고 표시 이름만 바꾼다(사용자 요청의 핵심 동작). */
export function useRenameDepartment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ deptId, name }: { deptId: string; name: string }) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/departments/${deptId}`,
        { name },
      );
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** 부서 삭제 — 그 부서에 멤버가 남아 있으면 BE가 막는다. */
export function useRemoveDepartment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deptId: string) => {
      const res = await apiClient.delete<ApiEnvelope<ProjectDetailDto>>(
        `/projects/${projectId}/departments/${deptId}`,
      );
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// workflow 부서 재배정 훅은 사라졌다 — Name/Description/Department가 화면의 Save 버튼
// 하나로 묶이면서 `PATCH /workflows/:id`(useUpdateWorkflow)로 옮겨갔다. 그쪽이
// editAccess의 부서 교체까지 한 번에 처리한다(설계서 02장 §7.2).


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
 * 편집할 수 있다. department는 만드는 사람이 이 과제에서 실제로 속한 부서 중 하나여야 하며
 * (BE가 재검증), creatorIsAdmin은 소속 부서가 하나도 없는 admin이 예외적으로 unassigned
 * workflow를 만들 수 있게 하는 신호다.
 */
export function useCreateWorkflow(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string; department: string; description?: string; color?: string;
    }) => {
      const res = await apiClient.post<ApiEnvelope<WorkflowDto>>(`/projects/${projectId}/workflows`, payload);
      return res.data.data;
    },
    onSuccess: (workflow) => {
      qc.setQueryData(queryKeys.workflow(workflow.id), workflow);
      qc.invalidateQueries({ queryKey: queryKeys.projectWorkflows(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

/**
 * 이 과제의 workflow **전체**를 반환한다 — 권한 없는 것도 포함된다.
 *
 * ★ 목록에서 빼지 않는 이유는 Information page가 "존재는 보여주되 disabled로 잠근다"를
 *   그려야 하기 때문이다(설계서 01장 §3.7). 각 항목의 `myAccess`가 null이면 그 workflow는
 *   이름·부서 외에 아무 값도 담고 있지 않다.
 * ★ app bar의 select는 `myAccess === null`인 항목을 option에서 **뺀다**.
 */
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

// workflow-directory 훅도 사라졌다 — 산출물의 수신 workflow(recvWorkflowId) 개념이
// 폐기되고 recipient(부서/사용자)로 대체되었다(설계서 04장 §3).

