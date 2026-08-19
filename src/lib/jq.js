import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * Where the jq binary lives. JQ_PATH wins, then `npm_config_jq_path` (the npm
 * config that the installer of node-jq honours), then the binary that node-jq
 * downloads next to its own package. Windows names that binary `jq.exe`.
 * @returns {string}
 */
export function jqBinaryPath() {
  return (
    process.env.JQ_PATH ??
    process.env.npm_config_jq_path ??
    join(
      dirname(require.resolve('node-jq/package.json')),
      'bin',
      process.platform === 'win32' ? 'jq.exe' : 'jq',
    )
  )
}

/**
 * npm >= 11 blocks the preinstall of node-jq, so an installed exactcli can
 * miss the binary. Check before a call, because node-jq hangs without it.
 * @returns {boolean}
 */
export function jqBinaryExists() {
  return existsSync(jqBinaryPath())
}
