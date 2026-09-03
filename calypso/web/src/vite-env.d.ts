/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Calypso api 베이스 URL. */
  readonly CALYPSO_API: string;
  /** SIREN api 베이스 URL — Project List/detail을 여기서 읽어온다 (Hub 설계서 §11.4). */
  readonly SIREN_API: string;
  // --- Common platform APIs (SIREN web과 동일한 값을 공유한다) ---
  readonly MOBILAVE: string;
  readonly USER_GROUP_API: string;
  readonly SDP_COMMON_API: string;
  readonly SYSTEM_API: string;
  /** 'dev' | 'prod' — 'dev'는 ADSSO를 건너뛰고 고정 계정으로 자동 로그인한다. */
  readonly ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
