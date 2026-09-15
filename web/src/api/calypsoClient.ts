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

export interface CalypsoVersionView {
  versionLabel: string;
  isReleased: boolean;
  versionRef: string;
  fileName: string;
  note: string;
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

export async function uploadCalypsoVersion(
  id: string, projectId: string, file: File, note: string,
): Promise<CalypsoArtifact> {
  const form = new FormData();
  form.append('file', file);
  form.append('note', note);
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/versions`, form, { params: { projectId } },
  );
  return data.data;
}

export async function releaseCalypsoArtifact(id: string, projectId: string, note: string): Promise<CalypsoArtifact> {
  const { data } = await apiClient.post<ApiEnvelope<CalypsoArtifact>>(
    `/calypso-artifacts/${id}/release`, { note }, { params: { projectId } },
  );
  return data.data;
}

export async function downloadCalypsoVersion(id: string, projectId: string, versionRef: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(
    `/calypso-artifacts/${id}/download/${encodeURIComponent(versionRef)}`,
    { params: { projectId }, responseType: 'blob' },
  );
  return data;
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
