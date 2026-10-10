// Caché "último bueno conocido": cada descubrimiento correcto se guarda en disco y solo se lee si
// LiteLLM no responde, para que opencode arranque igualmente con la última lista de modelos.
// (Idea y escritura atómica tomadas de yuseferi/opencode-litellm v1.4.2, MIT © 2026 Yusef Mohamadi.)

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConfigModels } from './types'

const CACHE_VERSION = 1

interface CacheFile {
  version: number
  savedAt: number
  baseURL: string
  models: ConfigModels
}

/** En el stack, XDG_CACHE_HOME apunta al data/cache de cada versión de opencode. */
function cacheFile(providerID: string, baseURL: string): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
  const hash = createHash('sha256').update(`${providerID}@${baseURL}`).digest('hex').slice(0, 12)
  return join(base, 'opencode-litellm-provider', `${providerID}-${hash}.json`)
}

export function readCache(providerID: string, baseURL: string): { savedAt: number; models: ConfigModels } | null {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(providerID, baseURL), 'utf8')) as CacheFile
    if (parsed.version !== CACHE_VERSION || typeof parsed.savedAt !== 'number') return null
    if (!parsed.models || typeof parsed.models !== 'object') return null
    return { savedAt: parsed.savedAt, models: parsed.models }
  } catch {
    return null
  }
}

/** Nunca falla: la caché es una ayuda, no un requisito. */
export function writeCache(providerID: string, baseURL: string, models: ConfigModels): void {
  const target = cacheFile(providerID, baseURL)
  const tmp = `${target}.${process.pid}.tmp`
  try {
    mkdirSync(join(target, '..'), { recursive: true })
    const payload: CacheFile = { version: CACHE_VERSION, savedAt: Date.now(), baseURL, models }
    // Fichero temporal + rename (atómico): otro proceso de opencode nunca lee un JSON a medias.
    writeFileSync(tmp, JSON.stringify(payload), 'utf8')
    renameSync(tmp, target)
  } catch {
    rmSync(tmp, { force: true })
  }
}
