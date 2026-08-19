import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-profile-current-test-'),
)
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, setActiveProfile } = await import('../../../src/lib/config.js')
const { default: ProfileCurrentCommand } =
  await import('../../../src/commands/profile/current.js')
const { runCmd } = await import('../../helpers.js')

describe('profile current', () => {
  beforeAll(() => {
    expect(getConf().path).toContain(TMP_CONFIG_DIR)
  })

  afterAll(() => {
    delete process.env.EXACTCLI_CONFIG_DIR
    rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    getConf().clear()
  })

  it('prints the active profile', async () => {
    setActiveProfile('staging')

    const stdout = await runCmd(ProfileCurrentCommand)

    expect(stdout).toContain('staging')
  })

  it('defaults to "default" when nothing was set', async () => {
    const stdout = await runCmd(ProfileCurrentCommand)

    expect(stdout).toContain('default')
  })
})
