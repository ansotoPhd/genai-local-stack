import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const PLUGIN_ID = 'opencode-litellm-provider'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogWriter = (level: LogLevel, message: string) => void

let writer: LogWriter | null = null

/**
 * opencode no ofrece una API de log al plugin y la consola de su servidor de fondo no se guarda,
 * así que en ejecución se usa fileLogWriter(). Sin writer (tests), se usa la consola.
 */
export function setLogWriter(next: LogWriter | null): void {
  writer = next
}

/** Ruta del log. En el stack, XDG_STATE_HOME apunta al data/state de opencode. */
export function logFilePath(): string {
  const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(base, PLUGIN_ID, 'plugin.log')
}

/** Añade cada línea al fichero, con fecha y nivel. Nunca falla: perder un log no debe romper nada. */
export function fileLogWriter(path = logFilePath()): LogWriter {
  return (level, message) => {
    try {
      mkdirSync(dirname(path), { recursive: true })
      appendFileSync(path, `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`)
    } catch {
      // Sin log.
    }
  }
}

export function log(level: LogLevel, message: string): void {
  const text = `[${PLUGIN_ID}] ${message}`
  if (writer) return writer(level, text)
  if (level === 'warn' || level === 'error') console.error(text)
  else console.log(text)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
