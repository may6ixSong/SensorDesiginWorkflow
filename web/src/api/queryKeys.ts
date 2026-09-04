export const queryKeys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  /** 과제 공통 일정(마일스톤) — workflow phase는 workflow 문서 안에 들어 있다. */
  projectMilestones: (projectId: string) => ['projects', projectId, 'milestones'] as const,
  projectWorkflows: (projectId: string) => ['projects', projectId, 'workflows'] as const,
  projectWorkflowDirectory: (projectId: string) => ['projects', projectId, 'workflow-directory'] as const,
  workflow: (workflowId: string) => ['workflows', workflowId] as const,
  deliverables: (workflowId: string) => ['workflows', workflowId, 'deliverables'] as const,
  deliverableVersions: (id: string) => ['deliverables', id, 'versions'] as const,
  memos: (workflowId: string) => ['workflows', workflowId, 'memos'] as const,
  edges: (workflowId: string) => ['workflows', workflowId, 'edges'] as const,
  hldReleases: (workflowId: string) => ['workflows', workflowId, 'hld-releases'] as const,
  hubServices: ['hub', 'services'] as const,
  /** Calypso api를 직접 호출한다(§11.5) — SIREN이 소유한 캐시가 아니라 그냥 원격 데이터 캐시다. */
  calypsoArtifacts: (projectId: string) => ['calypso', 'artifacts', projectId] as const,
  calypsoArtifact: (id: string) => ['calypso', 'artifacts', 'detail', id] as const,
};
