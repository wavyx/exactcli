import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-division-current-'))

const { default: Cmd } =
  await import('../../../src/commands/division/current.js')
const { getConf, setProfileConfig } = await import('../../../src/lib/config.js')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  getConf().clear()
  delete process.env.EXACTCLI_DIVISION
  process.stdout.isTTY = false
})

describe('division current', () => {
  it('prints the division of the profile', async () => {
    setProfileConfig('default', 'division', 123)
    const out = JSON.parse(await runCmd(Cmd, []))
    expect(out).toEqual({ profile: 'default', division: 123 })
  })

  it('lets --division win over the profile', async () => {
    setProfileConfig('default', 'division', 123)
    const out = JSON.parse(await runCmd(Cmd, ['--division', '456']))
    expect(out).toEqual({ profile: 'default', division: 456 })
  })

  it('prints a human line in a terminal', async () => {
    setProfileConfig('default', 'division', 123)
    process.stdout.isTTY = true
    expect(await runCmd(Cmd, [])).toBe('Profile default uses division 123')
  })

  it('fails with 78 when no division is configured', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })
})
