export const queryKeys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  projectPhases: (projectId: string) => ['projects', projectId, 'phases'] as const,
  projectIps: (projectId: string) => ['projects', projectId, 'ips'] as const,
  projectIpDirectory: (projectId: string) => ['projects', projectId, 'ip-directory'] as const,
  ip: (ipId: string) => ['ips', ipId] as const,
  deliverables: (ipId: string) => ['ips', ipId, 'deliverables'] as const,
  deliverableVersions: (id: string) => ['deliverables', id, 'versions'] as const,
  memos: (ipId: string) => ['ips', ipId, 'memos'] as const,
  edges: (ipId: string) => ['ips', ipId, 'edges'] as const,
  hldReleases: (ipId: string) => ['ips', ipId, 'hld-releases'] as const,
};
