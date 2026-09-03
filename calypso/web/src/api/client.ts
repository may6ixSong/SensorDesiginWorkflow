import axios from 'axios';

/**
 * Calypso api. SIREN api와 같은 방식으로 KnoxID 헤더에 호출자를 싣는다 -
 * 인증 자체는 ADSSO가 web에서 끝내고, api는 그 KnoxID로만 식별한다.
 */
export const api = axios.create({
  baseURL: import.meta.env.CALYPSO_API ?? 'http://localhost:3010/api/v1',
});

/** SSO 붙기 전까지의 임시 사용자 - SIREN의 사용자 스위처와 같은 성격이다. */
export function currentKnoxId(): string {
  return localStorage.getItem('calypso.knoxId') ?? 'sdp.op';
}

api.interceptors.request.use((config) => {
  config.headers['x-knox-id'] = currentKnoxId();
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

export async function listArtifacts(mine: boolean): Promise<ArtifactView[]> {
  const { data } = await api.get('/artifacts', { params: mine ? { mine: 'true' } : {} });
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
