import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useProject } from '@/api/hooks/useProjects';
import { apiClient, ApiEnvelope } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { ProjectDetailDto } from '@/types/domain';

/**
 * 부서 id → 표시 이름(설계서 02장 §9.3). `Project.departments`가 이름 문자열에서
 * `{id, name}` 쌍으로 바뀌면서, 화면은 이제 id만 들고 있고 이름은 조회 시점에 이
 * 배열에서 찾아 보여준다 — 01장 §6의 KnoxID·SDPCommonAPI 패턴과 같은 모양이다.
 *
 * ★ 추가 네트워크 호출이 없다 — `useProject(projectId)`는 이미 그 프로젝트를 보고 있는
 *   화면 어딘가(WorkflowPage, ProjectPageShell 등)가 먼저 불러 둔 React Query 캐시를
 *   그대로 재사용한다. 이 훅은 그 캐시에서 `Map`을 만드는 순수 로컬 연산일 뿐이다.
 */
export function useDepartmentLabel(projectId: string | undefined) {
  const { data: project } = useProject(projectId);

  const nameById = useMemo(
    () => new Map((project?.departments ?? []).map((d) => [d.id, d.name])),
    [project?.departments],
  );

  const label = useMemo(
    () => (deptId: string) => nameById.get(deptId) ?? deptId,
    [nameById],
  );

  return { label, departments: project?.departments ?? [] };
}

/**
 * My Assignment류 화면 — 한 화면에 **여러 과제**의 row가 함께 뜬다(설계서 09장, 과제를
 * 가로지르는 조회라 "지금 보고 있는 project" 하나가 없다). 그래서 `useDepartmentLabel`
 * 하나로는 못 풀고, 화면에 실제로 나타난 project id마다 하나씩 조회한다 — `useQueries`로
 * 한 번에 묶어 부르므로 Rules of Hooks를 어기지 않는다(row.map() 안에서 개별 호출하지
 * 않는다).
 *
 * ★ 이미 그 project를 다른 화면(Project List, 그 workflow 화면 등)에서 본 적이 있다면
 *   `useProject`와 **같은 쿼리 키**를 쓰므로 캐시를 그대로 재사용해 추가 호출이 없다.
 *   처음 보는 project라면 그 project당 딱 한 번만 가볍게 불러온다 — row 개수가 아니라
 *   화면에 나타난 **서로 다른 project 수**만큼만 나간다.
 */
export function useDepartmentLabels(projectIds: (string | undefined)[]) {
  const distinct = useMemo(
    () => Array.from(new Set(projectIds.filter((id): id is string => Boolean(id)))),
    [projectIds],
  );

  const results = useQueries({
    queries: distinct.map((id) => ({
      queryKey: queryKeys.project(id),
      queryFn: async () => {
        const res = await apiClient.get<ApiEnvelope<ProjectDetailDto>>(`/projects/${id}`);
        return res.data.data;
      },
      staleTime: 60_000,
    })),
  });

  const label = useMemo(() => {
    const byProject = new Map<string, Map<string, string>>();
    distinct.forEach((id, i) => {
      const departments = results[i]?.data?.departments ?? [];
      byProject.set(id, new Map(departments.map((d) => [d.id, d.name])));
    });
    return (projectId: string, deptId: string) => byProject.get(projectId)?.get(deptId) ?? deptId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct, ...results.map((r) => r.data)]);

  return { label };
}
