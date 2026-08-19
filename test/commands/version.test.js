import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCmd } from '../helpers.js'

// Isolate the conf store BEFORE the command is imported, so the run never
// reads or writes the profiles of the developer.
const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-version-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { default: VersionCommand } =
  await import('../../src/commands/version.js')

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

describe('version', () => {
  beforeEach(() => {
    process.stdout.isTTY = true
  })

  it('prints one line with the version, node and platform', async () => {
    const out = await runCmd(VersionCommand, [])
    expect(out).toMatch(/^exactcli\/\d+\.\d+\.\d+ node\/v\d+.* \w+-\w+$/)
  })

  it('prints an object in json mode', async () => {
    const out = JSON.parse(await runCmd(VersionCommand, ['--output', 'json']))
    expect(out).toEqual({
      exactcli: expect.stringMatching(/^\d+\.\d+\.\d+/),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    })
  })

  it('keeps the config store inside the temp directory', async () => {
    const { getConf } = await import('../../src/lib/config.js')
    expect(getConf().path).toContain(TMP_CONFIG_DIR)
  })
})
