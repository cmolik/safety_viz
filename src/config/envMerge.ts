// src/config/envMerge.ts

/**
 * Merges build-time Vite variables (prefix SAFETY_VIZ_) and runtime window.__config__.
 * All values are string/undefined (Vite env are strings).
 */

const VITE_PREFIX = 'SAFETY_VIZ_'

// Vite puts env into import.meta.env - at runtime these are strings
type EnvDict = Record<string, string | undefined>
const viteEnv = import.meta.env as unknown as EnvDict

const fromVite: EnvDict = Object.keys(viteEnv).reduce<EnvDict>((acc, key) => {
  if (key.startsWith(VITE_PREFIX)) {
    const stripped = key.slice(VITE_PREFIX.length)
    acc[stripped] = viteEnv[key]
  }
  return acc
}, {})

const fromRuntime: EnvDict =
  typeof window !== 'undefined' && window.__config__ ? window.__config__ : {}

const ENV: EnvDict = { ...fromVite, ...fromRuntime }

/**
 * Safe getter with optional default.
 * Throws an error if neither value nor default is provided.
 */
export function getEnv(name: string, defaultValue?: string): string {
  const value = ENV[name] ?? defaultValue
  if (value !== undefined) return value
  throw new Error(`Missing environment variable: ${name}`)
}

// Re-exports for convenient use in the app
export const API_URL = getEnv('API_URL')+'/'
export const BASENAME = getEnv('BASENAME', '')

