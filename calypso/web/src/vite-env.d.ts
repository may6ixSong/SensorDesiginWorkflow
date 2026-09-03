/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Calypso api 베이스 URL. vite.config.ts의 envPrefix에 CALYPSO_API가 들어 있다. */
  readonly CALYPSO_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
