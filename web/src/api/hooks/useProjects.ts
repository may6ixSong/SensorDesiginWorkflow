import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiEnvelope } from '../client';
import { queryKeys } from '../queryKeys';
import { IpDto, PhaseRef, ProjectDto } from '@/types/domain';
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
