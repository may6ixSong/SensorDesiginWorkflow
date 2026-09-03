import axios from 'axios';

/**
 * Calypso api. SIREN api와 같은 방식으로 KnoxID 헤더에 호출자를 싣는다 -
 * 인증 자체는 ADSSO가 web에서 끝내고, api는 그 KnoxID로만 식별한다.
 */
export const api = axios.create({
  baseURL: import.meta.env.CALYPSO_API ?? 'http://localhost:3010/api/v1',
});

/**
 * 현재 호출자 식별 상태 — AuthProvider가 로그인 완료 시점에 setApiKnoxId()로 채운다
 * (SIREN web의 api/client.ts와 동일한 패턴). 그 전까지는 dev 편의용 기본값을 쓴다.
 */
let currentKnoxId = localStorage.getItem('calypso.knoxId') ?? 'sdp.op';
let currentUserGroup: string | null = null;

export function setApiKnoxId(knoxId: string): void {
  currentKnoxId = knoxId;
  localStorage.setItem('calypso.knoxId', knoxId);
}
export function getApiKnoxId(): string {
  return currentKnoxId;
}
/** api의 Admin 판정 근거로는 쓰지 않는다(Calypso는 자기 등록자 본인 전용 편집만 안다) — SIREN 호출용으로만 보관. */
export function setApiUserGroup(group: string | null): void {
  currentUserGroup = group;
}
export function getApiUserGroup(): string | null {
  return currentUserGroup;
}

api.interceptors.request.use((config) => {
  config.headers['x-knox-id'] = currentKnoxId;
  return config;
});

export interface VersionView {
  versionLabel: string;
  isReleased: boolean;
  versionRef: string;
  fileName: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface ArtifactView {
  id: string;
  projectId: string;
  department: string;
  name: string;
  description: string;
  createdBy: string;
  canEdit: boolean;
  versionCount: number;
  latestVersion: VersionView | null;
  releasedVersion: VersionView | null;
  versions?: VersionView[];
}

export async function listArtifacts(query: { projectId?: string; mine?: boolean }): Promise<ArtifactView[]> {
  const params: Record<string, string> = {};
  if (query.projectId) params.projectId = query.projectId;
  if (query.mine) params.mine = 'true';
  const { data } = await api.get('/artifacts', { params });
  return data.data;
}

export async function getArtifact(id: string): Promise<ArtifactView> {
  const { data } = await api.get(`/artifacts/${id}`);
  return data.data;
}

export async function createArtifact(input: {
  projectId: string;
  department: string;
  name: string;
  description?: string;
}): Promise<ArtifactView> {
  const { data } = await api.post('/artifacts', input);
  return data.data;
}

export async function uploadVersion(id: string, file: File, note: string): Promise<ArtifactView> {
  const form = new FormData();
  form.append('file', file);
  form.append('note', note);
  const { data } = await api.post(`/artifacts/${id}/versions`, form);
  return data.data;
}

export async function releaseArtifact(id: string, note: string): Promise<ArtifactView> {
  const { data } = await api.post(`/artifacts/${id}/release`, { note });
  return data.data;
}
