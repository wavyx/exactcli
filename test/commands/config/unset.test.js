import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-config-unset-test-'),
)
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, setProfileConfig, getProfileConfig } =
  await import('../../../src/lib/config.js')
const { default: ConfigUnsetCommand } =
  await import('../../../src/commands/config/unset.js')
const { runCmd } = await import('../../helpers.js')

describe('config unset', () => {
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

  it('removes a set key and confirms', async () => {
    setProfileConfig('default', 'default_output', 'json')

    const stdout = await runCmd(ConfigUnsetCommand, ['default_output'])

    expect(getProfileConfig('default', 'default_output')).toBeUndefined()
    expect(stdout).toContain('default_output')
  })

  it('reports when the key was not set and does not delete', async () => {
    const stdout = await runCmd(ConfigUnsetCommand, ['host'])

    expect(stdout).toContain('not set')
  })

  it('emits { profile, key, unset: true } as json when removed', async () => {
    setProfileConfig('default', 'default_output', 'json')

    const stdout = await runCmd(ConfigUnsetCommand, [
      'default_output',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({
      profile: 'default',
      key: 'default_output',
      unset: true,
    })
  })

  it('emits { profile, key, unset: false } as json when not set', async () => {
    const stdout = await runCmd(ConfigUnsetCommand, [
      'host',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({
      profile: 'default',
      key: 'host',
      unset: false,
    })
  })
})
