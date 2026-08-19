import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-config-list-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, setProfileConfig } = await import('../../../src/lib/config.js')
const { default: ConfigListCommand } =
  await import('../../../src/commands/config/list.js')
const { runCmd } = await import('../../helpers.js')

describe('config list', () => {
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

  it('lists key=value pairs for the active profile', async () => {
    setProfileConfig('default', 'host', 'start.exactonline.be')
    setProfileConfig('default', 'division', 123456)

    const stdout = await runCmd(ConfigListCommand)

    expect(stdout).toContain('host=start.exactonline.be')
    expect(stdout).toContain('division=123456')
  })

  it('reports when no config is set', async () => {
    const stdout = await runCmd(ConfigListCommand)

    expect(stdout).toContain('No config set')
  })

  it('emits [{ key, value }] as json', async () => {
    setProfileConfig('default', 'host', 'start.exactonline.be')
    setProfileConfig('default', 'division', 123456)

    const stdout = await runCmd(ConfigListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([
      { key: 'host', value: 'start.exactonline.be' },
      { key: 'division', value: 123456 },
    ])
  })

  it('emits an empty array as json when no config is set', async () => {
    const stdout = await runCmd(ConfigListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })
})
