/** 서비스 하나가 낼 수 있는 산출물 종류 (설계서 07장 §3.1) — SIREN이 등록 시점에 key를 발급한다. */
export interface HubArtifactType {
  key: string;
  name: string;
  description: string;
}

/**
 * Hub 레지스트리 항목 (설계서 07장 §3). ServiceManagePage/후보 선택 화면이 쓰는 타입이다.
 * `token`은 Admin 응답(등록/재등록/Service Manage 목록)에만 실린다 — 일반 사용자용
 * 응답에는 아예 없다.
 */
export interface HubService {
  key: string;
  name: string;
  description: string;
  icon: string;
  contractVersion: string;
  /** 'A' = OA Service, 'C' = HPC Service. Calypso(File Artifacts, 'B')는 이 레지스트리에 없다. */
  defaultTier: 'A' | 'B' | 'C' | 'D';
  transport: 'http' | 'none';
  baseUrl: string | null;
  isBuiltIn: boolean;
  enabled: boolean;
  artifactTypes: HubArtifactType[];
  /** Admin 전용 — 이 서비스(baseURL)가 version 이벤트를 보낼 때 쓰는 Bearer token. */
  token?: string | null;
}
