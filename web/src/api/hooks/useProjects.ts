import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { IpDto, PhaseRef, ProjectDetailDto, ProjectDto } from '@/types/domain';
import { useAuthStore } from '@/store/authStore';

export function useProjects() {
  const isAuthed = Boolean(useAuthStore((s) => s.token));
  return useQuery({
    queryKey: queryKeys.projects,
    enabled: isAuthed,
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<ProjectDto[]>>('/projects');
      return res.data.data;
    },
  });
}

/** Project Information 페이지용 상세(phases + 부서별 팀원 로스터). */
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

/** 과제 메타데이터(이름/코드/도메인/상태) 수정 — Phase는 읽기 전용이라 여기서 다루지 않는다. */
export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; code?: string; domain?: string; status?: string }) => {
      const res = await apiClient.patch<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}`, payload);
      return res.data.data;
    },
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(projectId), project);
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

/** 과제 팀원(부서별 로스터) 추가 — 이 과제의 IP 중 하나라도 Edit 권한이 있어야 한다(BE 재검증). */
export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { userId: string; department: string }) => {
      const res = await apiClient.post<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}/members`, payload);
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete<ApiEnvelope<ProjectDetailDto>>(`/projects/${projectId}/members/${userId}`);
      return res.data.data;
    },
    onSuccess: (project) => qc.setQueryData(queryKeys.project(projectId), project),
  });
}

/** Phase는 읽기 전용 참조 (설계서 3.2) - 이 앱에는 Phase를 쓰는 API가 없다. */
export function useProjectPhases(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectPhases(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<PhaseRef[]>>(`/projects/${projectId}/phases`);
      return res.data.data;
    },
  });
}

/** Edit 또는 View 권한이 있는 IP만 반환 (설계서 5.1). */
export function useProjectIps(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectIps(projectId ?? ''),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await apiClient.get<ApiEnvelope<IpDto[]>>(`/projects/${projectId}/ips`);
      return res.data.data;
    },
  });
}
