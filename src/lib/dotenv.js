import { existsSync, readFileSync } from 'node:fs'

// Only the keys of exactcli itself pass: any other key could name a binary
// that the CLI spawns, which would turn a `.env` in a working directory into
// arbitrary code execution. The two keys that unlock writes or move the
// config store stay shell-only, so a checked-out `.env` cannot switch writes
// on or point the CLI at another lock.
const ENV_KEY_RE = /^EXACTCLI_[A-Z0-9_]+$/
export const SHELL_ONLY = new Set([
  'EXACTCLI_ALLOW_WRITES',
  'EXACTCLI_CONFIG_DIR',
])

/**
 * Load a `.env` file into env. A key that env already has keeps its value.
 * @param {string} file
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]} the keys that were loaded
 */
export function loadDotEnv(file, env = process.env) {
  if (!existsSync(file)) return []
  const loaded = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!ENV_KEY_RE.test(key) || SHELL_ONLY.has(key)) continue
    if (env[key]) continue
    env[key] = trimmed.slice(eq + 1).trim()
    loaded.push(key)
  }
  return loaded
}
