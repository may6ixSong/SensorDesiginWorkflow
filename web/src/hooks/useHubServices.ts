/** 서비스 하나가 낼 수 있는 산출물 종류 (설계서 §19.1). */
export interface HubArtifactType {
  key: string;
  name: string;
  viewUrlTemplate: string | null;
  sampleUrl: string | null;
}

/** Hub 레지스트리 항목 (설계서 §3.2, §19.1). ServiceManagePage가 쓰는 타입이다. */
export interface HubService {
  key: string;
  name: string;
  description: string;
  icon: string;
  contractVersion: string;
  defaultTier: 'A' | 'B' | 'C' | 'D';
  transport: 'http' | 'shared-db' | 'none';
  baseUrl: string | null;
  viewUrlTemplate: string | null;
  embedUploadUrlTemplate: string | null;
  isBuiltIn: boolean;
  enabled: boolean;
  artifactTypes: HubArtifactType[];
}
