/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SAFETY_VIZ_API_URL?: string
  readonly SAFETY_VIZ_BASENAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    __config__?: Record<string, string | undefined>
  }
}