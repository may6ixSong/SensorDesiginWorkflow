/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SIREN's own backend (api/). */
  readonly SIREN_API: string;
  /** Corporate ADSSO gateway — redirect target for login. */
  readonly MOBILAVE: string;
  /** Platform user group/authority/prefs service. */
  readonly USER_GROUP_API: string;
  /** SDP common service (employee directory, etc.). */
  readonly SDP_COMMON_API: string;
  /** Platform system service (notices, SignalR hub). */
  readonly SYSTEM_API: string;
  /** 'dev' | 'prod' */
  readonly ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
