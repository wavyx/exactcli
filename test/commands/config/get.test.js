import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-config-get-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, setProfileConfig } = await import('../../../src/lib/config.js')
const { default: ConfigGetCommand } =
  await import('../../../src/commands/config/get.js')
const { runCmd } = await import('../../helpers.js')

describe('config get', () => {
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

  it('prints the value for a set key', async () => {
    setProfileConfig('default', 'host', 'start.exactonline.be')

    const stdout = await runCmd(ConfigGetCommand, ['host'])

    expect(stdout).toBe('start.exactonline.be')
  })

  it('prints a number value as text', async () => {
    setProfileConfig('default', 'division', 123456)

    const stdout = await runCmd(ConfigGetCommand, ['division'])

    expect(stdout).toBe('123456')
  })

  it('exits 0 with empty output for an unset key', async () => {
    const stdout = await runCmd(ConfigGetCommand, ['division'])

    expect(stdout).toBe('')
  })

  it('emits { key, value } as json', async () => {
    setProfileConfig('default', 'host', 'start.exactonline.be')

    const stdout = await runCmd(ConfigGetCommand, ['host', '--output', 'json'])

    expect(JSON.parse(stdout)).toEqual({
      key: 'host',
      value: 'start.exactonline.be',
    })
  })

  it('emits { key } with no value as json for an unset key', async () => {
    const stdout = await runCmd(ConfigGetCommand, [
      'division',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({ key: 'division' })
  })
})
