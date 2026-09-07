import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadDotEnv, SHELL_ONLY } from '../../src/lib/dotenv.js'

let dir

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'exactcli-dotenv-'))
  writeFileSync(
    join(dir, '.env'),
    [
      '# a comment',
      '',
      'no equals sign',
      'EXACTCLI_PROFILE = acme ',
      'EXACTCLI_DIVISION=1',
      'JQ_PATH=/nonexistent/hijack',
      'EXACTCLI_ALLOW_WRITES=1',
      'EXACTCLI_CONFIG_DIR=/nonexistent/other',
    ].join('\n'),
  )
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('loadDotEnv', () => {
  it('loads EXACTCLI_ keys, trimmed, and keeps a value env already has', () => {
    const env = { EXACTCLI_DIVISION: '2' }
    expect(loadDotEnv(join(dir, '.env'), env)).toEqual(['EXACTCLI_PROFILE'])
    expect(env).toEqual({ EXACTCLI_PROFILE: 'acme', EXACTCLI_DIVISION: '2' })
  })

  it('never loads a binary path, the write switch or the config dir', () => {
    const env = {}
    loadDotEnv(join(dir, '.env'), env)
    expect(env.JQ_PATH).toBeUndefined()
    for (const key of SHELL_ONLY) expect(env[key]).toBeUndefined()
  })

  it('loads nothing when the file is absent', () => {
    expect(loadDotEnv(join(dir, 'missing.env'), {})).toEqual([])
  })
})
