export const queryKeys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  /** 과제 공통 일정(마일스톤) — workflow phase는 workflow 문서 안에 들어 있다. */
  projectMilestones: (projectId: string) => ['projects', projectId, 'milestones'] as const,
  projectWorkflows: (projectId: string) => ['projects', projectId, 'workflows'] as const,

  workflow: (workflowId: string) => ['workflows', workflowId] as const,
  /** 캔버스 노드 — 각 항목에 artifact와 권한 판정 결과가 함께 담겨 온다. */
  nodes: (workflowId: string) => ['workflows', workflowId, 'nodes'] as const,
  /** A Tier(Calypso 제외 Hub 등록 서비스)의 라이브 버전 조회 — slide를 열었을 때만 쓴다. */
  liveVersions: (workflowId: string, nodeId: string) =>
    ['workflows', workflowId, 'nodes', nodeId, 'live-versions'] as const,
  /** 한 버전의 html preview(A/C Tier, B의 upload/download 자리를 대신한다). */
  htmlView: (workflowId: string, nodeId: string, versionLabel: string) =>
    ['workflows', workflowId, 'nodes', nodeId, 'html-view', versionLabel] as const,
  memos: (workflowId: string) => ['workflows', workflowId, 'memos'] as const,
  comments: (workflowId: string, nodeId: string) => ['workflows', workflowId, 'nodes', nodeId, 'comments'] as const,
  edges: (workflowId: string) => ['workflows', workflowId, 'edges'] as const,

  /** Release — workflow별 목록, 미리보기, 부서별 필터 뷰, 산출물별 타임라인. */
  releases: (workflowId: string) => ['workflows', workflowId, 'releases'] as const,
  releasePreview: (workflowId: string) => ['workflows', workflowId, 'release', 'preview'] as const,
  releasesByDepartment: (projectId: string, department: string) =>
    ['projects', projectId, 'releases', 'department', department] as const,
  releasesByArtifact: (artifactId: string) => ['artifacts', artifactId, 'releases'] as const,

  /**
   * My Assignment (설계서 09장) — 과제를 가로지르는 조회라 projectId로 키를 나누지
   * 않는다. 달력은 화면에 그리는 격자 범위를 그대로 키에 담아, 달을 앞뒤로 오갈 때
   * 이미 본 달은 다시 부르지 않는다.
   */
  myReleases: (direction: 'received' | 'published', page: number, size: number, projectIds?: string[]) =>
    ['my', 'releases', direction, page, size, projectIds ? [...projectIds].sort() : undefined] as const,
  myArtifacts: ['my', 'artifacts'] as const,
  myCalendar: (from: string, to: string) => ['my', 'calendar', from, to] as const,
  /** release 한 건의 상세 — 목록 행을 눌러 다이얼로그를 열 때만 부른다. */
  release: (releaseId: string) => ['releases', releaseId] as const,
  /** release 한 건에 대한 부서별 댓글 스레드 — department별로 완전히 분리된 키다. */
  releaseFeedback: (releaseId: string, department: string) =>
    ['releases', releaseId, 'feedback', department] as const,

  hubServices: ['hub', 'services'] as const,

  /**
   * "새 Artifact 추가" 다이얼로그(설계서 04장 §6) — Tier별 후보 목록. project 사전 링크
   * 단계는 폐지됐다(07장 §7) — code/revision은 그 workflow가 속한 project에서 서버가
   * 그대로 채우므로 FE는 externalProjectId를 더 이상 들고 있지 않는다.
   */
  artifactCandidates: (workflowId: string, source: string, intent: string, serviceKey?: string) =>
    ['workflows', workflowId, 'artifact-candidates', source, intent, serviceKey ?? ''] as const,
  /** Calypso api를 직접 호출한다 — SIREN이 소유한 캐시가 아니라 원격 데이터 캐시다. */
  calypsoArtifacts: (projectId: string) => ['calypso', 'artifacts', projectId] as const,
  calypsoArtifact: (id: string) => ['calypso', 'artifacts', 'detail', id] as const,
  calypsoDepartmentRoster: (projectId: string) => ['calypso', 'department-roster', projectId] as const,
};
