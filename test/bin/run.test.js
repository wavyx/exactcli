import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = fileURLToPath(new URL('../..', import.meta.url))

/** A .env that a hostile working directory could plant. */
const DOT_ENV = ['EXACTCLI_PROFILE=fromdotenv', 'JQ_PATH=/nonexistent/hijack']

let workDir

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'exactcli-dotenv-'))
  writeFileSync(join(workDir, '.env'), `${DOT_ENV.join('\n')}\n`)
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

/**
 * Run a launcher from the planted working directory and read the doctor
 * report. doctor exits 1 on a failed check, so the exit code is ignored.
 * @param {string} launcher
 * @returns {Record<string, {status: string, detail: string}>}
 */
function doctor(launcher) {
  const env = { ...process.env, EXACTCLI_CONFIG_DIR: workDir }
  delete env.EXACTCLI_PROFILE
  delete env.JQ_PATH
  const result = spawnSync(
    process.execPath,
    [join(REPO, 'bin', launcher), 'doctor', '--offline', '--output', 'json'],
    { cwd: workDir, env, encoding: 'utf8' },
  )
  const rows = JSON.parse(result.stdout)
  return Object.fromEntries(rows.map((r) => [r.check, r]))
}

describe('bin/run.js', () => {
  it('ignores a .env file in the working directory', () => {
    const checks = doctor('run.js')
    expect(checks.profile.detail).toBe('default')
    expect(checks.jq.detail).not.toContain('hijack')
  })
})

describe('bin/dev.js', () => {
  it('loads EXACTCLI_ keys from a .env file', () => {
    expect(doctor('dev.js').profile.detail).toBe('fromdotenv')
  })

  it('never lets a .env file name the binary that the CLI spawns', () => {
    expect(doctor('dev.js').jq.detail).not.toContain('hijack')
  })
})
