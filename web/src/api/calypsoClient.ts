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

export interface CalypsoVersionView {
  versionLabel: string;
  isReleased: boolean;
  versionRef: string;
  /** network===null(File)일 때만 채워진다 — 한 버전에 여러 파일이 있을 수 있다. */
  files: CalypsoFile[];
  /** network==='OA'일 때만. */
  viewUrl: string | null;
  /** network==='HPC'일 때만. */
  hpcPath: string | null;
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
  /** null(File) | 'OA' | 'HPC' — 등록 시 한 번 정해지면 바뀌지 않는다(설계서 04장 §2). */
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
  projectId: string; department: string; name: string; description?: string;
}): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>('/calypso-artifacts', input);
  return data.data;
}

/**
 * 새 버전 추가 — 콘텐츠는 그 artifact의 `network`로 정해진다(설계서 04장 §2.2):
 *   network===null(File) → `files`(1개 이상, 한 버전에 여러 파일을 묶을 수 있다)
 *   network==='OA'       → `viewUrl`
 *   network==='HPC'      → `hpcPath`
 * versionCount===0(아직 첫 버전이 없는 새 artifact)이면 이 호출이 network를 그대로
 * 확정한다 — "새 Artifact 추가" 다이얼로그가 아니라 여기서 콘텐츠 종류를 고른다
 * (04장 §6.4).
 */
export async function addCalypsoVersion(
  id: string,
  projectId: string,
  input: { files?: File[]; viewUrl?: string; hpcPath?: string },
  versionNote: string,
  description?: string,
): Promise<CalypsoArtifact> {
  const form = new FormData();
  (input.files ?? []).forEach((f) => form.append('files', f));
  if (input.viewUrl) form.append('viewUrl', input.viewUrl);
  if (input.hpcPath) form.append('hpcPath', input.hpcPath);
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

export async function setCalypsoRestrictView(id: string, projectId: string, restrictView: boolean): Promise<CalypsoArtifact> {
  const { data } = await apiClient.patch<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/restrict-view`, { restrictView }, { params: { projectId } },
  );
  return data.data;
}
