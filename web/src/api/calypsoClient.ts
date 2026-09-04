import axios from 'axios';
import { getApiActingAs, getApiKnoxId, getApiUserGroup } from './client';

/**
 * Calypso api를 직접 호출하는 클라이언트 (설계서 §11.5).
 *
 * Calypso 웹앱(calypso/web)은 당분간 쓰지 않는다 — 산출물 등록·관리 화면은 SIREN web
 * 안에 두고, 이 클라이언트로 Calypso api를 직접 호출한다. 데이터 소유권은 그대로
 * Calypso 백엔드에 있다: 여기서 하는 건 "다른 화면에서 그 api를 부르는 것"뿐이지,
 * SIREN이 산출물 데이터를 대신 갖거나 흉내 내는 게 아니다.
 *
 * 인증은 SIREN api와 같은 방식(X-Knox-Id 등 헤더뿐)이라 같은 ADSSO 신원을 그대로
 * 싣는다 — 별도 토큰 교환이 없다. Calypso api의 CORS_ORIGIN에 SIREN web의 origin이
 * 등록돼 있어야 브라우저에서 이 호출이 성공한다(calypso/.env의 몫).
 */
export const calypsoApi = axios.create({
  baseURL: import.meta.env.CALYPSO_API || 'http://localhost:3010/api/v1',
});

/**
 * 호출자가 **지금 보고 있는 project 안에서** 속한 department들 — Calypso의
 * "부서 단위 edit 부여는 본인 소속 부서로만" 검증(actor.ts)에 쓰인다. Project
 * membership은 project마다 다르므로 로그인 시점에 한 번 정하는 값이 아니라,
 * project를 아는 화면(ArtifactListPage/ArtifactDetailPage/DeliverableDialog)이
 * 자기가 이미 계산해 둔 값을 진입할 때마다 여기 실어준다.
 */
let currentDepartments: string[] = [];

export const setCalypsoUserDepartments = (departments: string[]) => {
  currentDepartments = departments;
};

calypsoApi.interceptors.request.use((config) => {
  const knoxId = getApiKnoxId();
  if (knoxId) config.headers['x-knox-id'] = knoxId;
  const userGroup = getApiUserGroup();
  if (userGroup) config.headers['x-user-group'] = userGroup;
  const actingAs = getApiActingAs();
  if (actingAs) config.headers['x-acting-as'] = actingAs;
  if (currentDepartments.length) config.headers['x-user-departments'] = currentDepartments.join(',');
  return config;
});

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
}

export async function listCalypsoArtifacts(query: {
  projectId?: string; department?: string; mine?: boolean;
}): Promise<CalypsoArtifact[]> {
  const params: Record<string, string> = {};
  if (query.projectId) params.projectId = query.projectId;
  if (query.department) params.department = query.department;
  if (query.mine) params.mine = 'true';
  const { data } = await calypsoApi.get<{ data: CalypsoArtifact[] }>('/artifacts', { params });
  return data.data;
}

export async function getCalypsoArtifact(id: string): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.get<{ data: CalypsoArtifact }>(`/artifacts/${id}`);
  return data.data;
}

export async function createCalypsoArtifact(input: {
  projectId: string; department: string; name: string; description?: string;
}): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.post<{ data: CalypsoArtifact }>('/artifacts', input);
  return data.data;
}

export async function uploadCalypsoVersion(id: string, file: File, note: string): Promise<CalypsoArtifact> {
  const form = new FormData();
  form.append('file', file);
  form.append('note', note);
  const { data } = await calypsoApi.post<{ data: CalypsoArtifact }>(`/artifacts/${id}/versions`, form);
  return data.data;
}

export async function releaseCalypsoArtifact(id: string, note: string): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.post<{ data: CalypsoArtifact }>(`/artifacts/${id}/release`, { note });
  return data.data;
}

export async function downloadCalypsoVersion(id: string, versionRef: string): Promise<Blob> {
  const { data } = await calypsoApi.get<Blob>(
    `/artifacts/${id}/download/${encodeURIComponent(versionRef)}`,
    { responseType: 'blob' },
  );
  return data;
}

export async function addCalypsoEditor(id: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.post<{ data: CalypsoArtifact }>(`/artifacts/${id}/editors`, grant);
  return data.data;
}

export async function removeCalypsoEditor(id: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.delete<{ data: CalypsoArtifact }>(`/artifacts/${id}/editors`, { data: grant });
  return data.data;
}

export async function addCalypsoViewGrant(id: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.post<{ data: CalypsoArtifact }>(`/artifacts/${id}/view-grants`, grant);
  return data.data;
}

export async function removeCalypsoViewGrant(id: string, grant: CalypsoGrantInput): Promise<CalypsoArtifact> {
  const { data } = await calypsoApi.delete<{ data: CalypsoArtifact }>(`/artifacts/${id}/view-grants`, { data: grant });
  return data.data;
}
