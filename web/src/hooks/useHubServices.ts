/** Hub 레지스트리 항목 (설계서 §3.2). AdminPage의 레지스트리 관리 화면이 쓰는 타입이다. */
export interface HubService {
  key: string;
  name: string;
  contractVersion: string;
  defaultTier: 'A' | 'B' | 'C' | 'D';
  transport: 'http' | 'shared-db' | 'none';
  baseUrl: string | null;
  viewUrlTemplate: string | null;
  embedUploadUrlTemplate: string | null;
  isBuiltIn: boolean;
  enabled: boolean;
}
