import axios from 'axios';
import { getApiKnoxId } from './client';

/**
 * SIREN api를 읽기 전용으로 호출하는 클라이언트 (Hub 설계서 §11.4) — SIREN이 결국
 * Project 전체를 관리하는 hub이고, Calypso는 그 Project List를 그대로 가져다 쓴다.
 * 인증은 Calypso 자기 api와 마찬가지로 X-Knox-Id 헤더 하나뿐이다 — 같은 ADSSO 신원을
 * 공유하므로 별도 토큰 교환이 없다.
 *
 * SIREN api의 CORS_ORIGIN에 이 앱의 origin(기본 http://localhost:5174)이 등록돼
 * 있어야 브라우저에서 이 호출이 성공한다 — api/.env의 몫이라 코드로는 못 고친다.
 */
export const sirenApi = axios.create({
  baseURL: import.meta.env.SIREN_API ?? 'http://localhost:3000/api/v1',
});

sirenApi.interceptors.request.use((config) => {
  config.headers['x-knox-id'] = getApiKnoxId();
  return config;
});

export interface SirenProjectMember {
  knoxId: string;
  departments: string[];
}

export interface SirenProject {
  _id: string;
  code: string;
  name: string;
  status: string;
}

export interface SirenProjectDetail extends SirenProject {
  /** 이 과제가 인정하는 부서(팀) 후보 목록 — 산출물 등록 다이얼로그의 department picker가 쓴다. */
  departments: string[];
  members: SirenProjectMember[];
}

export async function listSirenProjects(): Promise<SirenProject[]> {
  const { data } = await sirenApi.get<{ data: SirenProject[] }>('/projects');
  return data.data;
}

export async function getSirenProject(id: string): Promise<SirenProjectDetail> {
  const { data } = await sirenApi.get<{ data: SirenProjectDetail }>(`/projects/${id}`);
  return data.data;
}
