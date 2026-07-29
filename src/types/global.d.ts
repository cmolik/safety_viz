// src/types/global.d.ts
export {}

declare global {
  interface Window {
    __config__?: Record<string, string | undefined>;
  }
}
