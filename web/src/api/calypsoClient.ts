import { apiClient, ApiEnvelope } from './client';

/**
 * File Artifacts(Calypso, Tier B) — SIREN BE의 프록시를 통해서만 호출한다(설계서 07장 §2).
 *
 * ★ 예전에는 이 파일이 axios로 Calypso backend를 브라우저에서 직접 호출했다(knoxId/
 *   departments/actingAs 헤더도 여기서 직접 실었다). 이제 SIREN FE는 Calypso를 절대
 *   직접 호출하지 않는다 — 전부 SIREN BE(`/calypso-artifacts`)를 거치고, 그 department
 *   계산도 SIREN BE가 (actor + project 멤버십으로) 대신 한다. 그래서 이 파일의 모든
 *   함수는 `projectId`를 받아 그대로 SIREN BE에 실어 보낼 뿐, 헤더를 직접 만들지 않는다
 *   — `setCalypsoUserDepartments`/`setCalypsoActingAsGroup` 같은 전역 상태도 더 이상
 *   필요 없어 제거했다.
 */

export interface CalypsoFile {
  fileName: string;
  storageKey: string;
}

export interface CalypsoLink {
  url: string;
  label: string;
}

export interface CalypsoPathEntry {
  path: string;
  label: string;
}

export interface CalypsoVersionView {
  versionLabel: string;
  isReleased: boolean;
  versionRef: string;
  /** network와 무관하게 항상 올릴 수 있다 — 한 버전에 여러 파일이 있을 수 있다. */
  files: CalypsoFile[];
  /** network==='OA'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  links: CalypsoLink[];
  /** network==='HPC'인 artifact에서만 쓴다 — 여러 개 가능(사용자 요청). */
  paths: CalypsoPathEntry[];
  /** 짧은 한 줄 메모 — 필수, 서식 없는 텍스트. */
  versionNote: string;
  /** 서식 있는(HTML) 긴 설명 — 선택. 렌더링 전 반드시 sanitize한다. */
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface CalypsoGrant {
  type: 'user' | 'department';
  knoxId: string | null;
  department: string | null;
  grantedBy: string;
  grantedAt: string;
}

export type CalypsoGrantInput =
  | { type: 'user'; knoxId: string }
  | { type: 'department'; department: string };

export interface CalypsoArtifact {
  id: string;
  projectId: string;
  department: string;
  name: string;
  description: string;
  /** 'OA' | 'HPC' — 언제든 edit 권한자가 바꿀 수 있다(사용자 요청, `setCalypsoNetwork`).
   * 기존 버전들의 콘텐츠는 그대로 남는다. null은 마이그레이션 전의 예전 문서에만 남는다. */
  network: 'OA' | 'HPC' | null;
  createdBy: string;
  /** 'edit'이면 업로드/릴리스/권한관리 가능, 'view'면 released 버전만 열람. */
  myAccess: 'edit' | 'view';
  versionCount: number;
  latestVersion: CalypsoVersionView | null;
  releasedVersion: CalypsoVersionView | null;
  versions?: CalypsoVersionView[];
  editors: CalypsoGrant[];
  viewGrants: CalypsoGrant[];
  /** false(기본) — project member 누구나 view 가능. true면 viewGrants로만 제한. */
  restrictView: boolean;
}

export async function listCalypsoArtifacts(query: {
  projectId: string; department?: string; mine?: boolean;
}): Promise<CalypsoArtifact[]> {
  const params: Record<string, string> = { projectId: query.projectId };
  if (query.department) params.department = query.department;
  if (query.mine) params.mine = 'true';
  const { data } = await apiClient.get<ApiEnvelope<CalypsoArtifact[]>>('/calypso-artifacts', { params });
  return data.data;
}

export async function getCalypsoArtifact(id: string, projectId: string): Promise<CalypsoArtifact> {
  const { data } = await apiClient.get<ApiEnvelope<CalypsoArtifact>>(`/calypso-artifacts/${id}`, { params: { projectId } });
  return data.data;
}

export async function createCalypsoArtifact(input: {
  projectId: string; department: string; name: string; description?: string; network: 'OA' | 'HPC';
}): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>('/calypso-artifacts', input);
  return data.data;
}

/**
 * 새 버전 추가 — 파일은 network와 무관하게 항상 올릴 수 있고, 그 위에 network에 맞는
 * 위치 정보(OA면 links, HPC면 paths)도 몇 개든 같이 붙일 수 있다(사용자 요청, §3.9).
 * links/paths는 파일 업로드와 같은 multipart 요청 안에 JSON 문자열로 실어 보낸다.
 */
export async function addCalypsoVersion(
  id: string,
  projectId: string,
  input: { files?: File[]; links?: CalypsoLink[]; paths?: CalypsoPathEntry[] },
  versionNote: string,
  description?: string,
): Promise<CalypsoArtifact> {
  const form = new FormData();
  (input.files ?? []).forEach((f) => form.append('files', f));
  if (input.links?.length) form.append('linksJson', JSON.stringify(input.links));
  if (input.paths?.length) form.append('pathsJson', JSON.stringify(input.paths));
  form.append('versionNote', versionNote);
  if (description) form.append('description', description);
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/versions`, form, { params: { projectId } },
  );
  return data.data;
}

/**
 * sourceVersionRef를 안 주면 지금까지처럼 최신 minor를 승격한다. 주면 그 minor(released
 * 아니어야 함)의 콘텐츠로 새 released 버전을 만든다 — version tree에서 과거 작업본을
 * 골라 publish하는 경로(사용자 요청).
 */
export async function releaseCalypsoArtifact(
  id: string, projectId: string, versionNote: string, description?: string, sourceVersionRef?: string,
): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/release`, { versionNote, description, sourceVersionRef }, { params: { projectId } },
  );
  return data.data;
}

/**
 * 파일이 하나면 그대로, 여러 개면 zip으로 묶여서 내려온다 — Calypso가 그 판정을 한다
 * (설계서 04장 §2, §6). 파일명은 응답의 `Content-Disposition`에서 그대로 읽는다 —
 * 단일 파일이면 원래 이름, zip이면 Calypso가 붙인 `{artifact명}-{major}.{minor}.zip`이다.
 */
export async function downloadCalypsoVersion(
  id: string, projectId: string, versionRef: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await apiClient.get<Blob>(
    `/calypso-artifacts/${id}/download/${encodeURIComponent(versionRef)}`,
    { params: { projectId }, responseType: 'blob' },
  );
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : null;
  return { blob: res.data, filename };
}

export async function addCalypsoEditor(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/editors`, grant, { params: { projectId } },
  );
  return data.data;
}

export async function removeCalypsoEditor(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.delete<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/editors`, { params: { projectId }, data: grant },
  );
  return data.data;
}

export async function addCalypsoViewGrant(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/view-grants`, grant, { params: { projectId } },
  );
  return data.data;
}

export async function removeCalypsoViewGrant(id: string, projectId: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await apiClient.delete<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/view-grants`, { params: { projectId }, data: grant },
  );
  return data.data;
}

export interface CalypsoDepartmentRoster {
  departments: string[];
  members: { knoxId: string; departments: string[] }[];
}

/**
 * Access 패널의 부서/멤버 로스터 — 일부러 Calypso를 한 번 거쳐 SIREN에게 되묻는다
 * (사용자 결정, Calypso가 나중에 독립 서비스로 분리될 때를 대비한 경로).
 */
export async function getCalypsoDepartmentRoster(projectId: string): Promise<CalypsoDepartmentRoster> {
  const { data } = await apiClient.get<ApiEnvelope<CalypsoDepartmentRoster>>(
    '/calypso-artifacts/department-roster', { params: { projectId } },
  );
  return data.data;
}

export async function setCalypsoRestrictView(id: string, projectId: string, restrictView: boolean): Promise<CalypsoArtifact> {
  const { data } = await apiClient.patch<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/restrict-view`, { restrictView }, { params: { projectId } },
  );
  return data.data;
}

/**
 * network를 언제든 바꿀 수 있게 한다(사용자 요청) — 기존 버전들의 콘텐츠는 그대로
 * 둔다, 호출부가 변경 전에 그 영향을 경고한다.
 */
export async function setCalypsoNetwork(id: string, projectId: string, network: 'OA' | 'HPC'): Promise<CalypsoArtifact> {
  const { data } = await apiClient.patch<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/network`, { network }, { params: { projectId } },
  );
  return data.data;
}
