export const queryKeys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  /** 과제 공통 일정(마일스톤) — workflow phase는 workflow 문서 안에 들어 있다. */
  projectMilestones: (projectId: string) => ['projects', projectId, 'milestones'] as const,
  projectWorkflows: (projectId: string) => ['projects', projectId, 'workflows'] as const,

  workflow: (workflowId: string) => ['workflows', workflowId] as const,
  /** 캔버스 블록 — 각 항목에 artifact와 권한 판정 결과가 함께 담겨 온다. */
  blocks: (workflowId: string) => ['workflows', workflowId, 'blocks'] as const,
  memos: (workflowId: string) => ['workflows', workflowId, 'memos'] as const,
  edges: (workflowId: string) => ['workflows', workflowId, 'edges'] as const,

  /** Release — workflow별 목록, 미리보기, 부서별 필터 뷰, 산출물별 타임라인. */
  releases: (workflowId: string) => ['workflows', workflowId, 'releases'] as const,
  releasePreview: (workflowId: string) => ['workflows', workflowId, 'release', 'preview'] as const,
  releasesByDepartment: (projectId: string, department: string) =>
    ['projects', projectId, 'releases', 'department', department] as const,
  releasesByArtifact: (artifactId: string) => ['artifacts', artifactId, 'releases'] as const,

  hubServices: ['hub', 'services'] as const,
  hubProjectSearch: (serviceKey: string, code: string, revision: string) =>
    ['hub', 'services', serviceKey, 'projects', 'search', code, revision] as const,
  /** Calypso api를 직접 호출한다 — SIREN이 소유한 캐시가 아니라 원격 데이터 캐시다. */
  calypsoArtifacts: (projectId: string) => ['calypso', 'artifacts', projectId] as const,
  calypsoArtifact: (id: string) => ['calypso', 'artifacts', 'detail', id] as const,
};
