import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-config-unset-test-'),
)
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

// The keychain is the real one on a developer machine: never touch it here.
const mocks = vi.hoisted(() => ({
  getOAuthTokens: vi.fn(),
  setOAuthTokens: vi.fn(),
  withLock: vi.fn((_name, fn) => fn()),
}))

vi.mock('../../../src/lib/keychain.js', () => ({
  getOAuthTokens: mocks.getOAuthTokens,
  setOAuthTokens: mocks.setOAuthTokens,
  isKeychainAvailable: () => true,
}))
vi.mock('../../../src/lib/lock.js', () => ({ withLock: mocks.withLock }))

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
    vi.resetAllMocks()
    mocks.getOAuthTokens.mockResolvedValue(null)
    mocks.withLock.mockImplementation((_name, fn) => fn())
  })

  it('removes write_divisions from the config and the keychain blob', async () => {
    setProfileConfig('dev', 'write_divisions', [123456])
    mocks.getOAuthTokens.mockResolvedValue({
      accessToken: 'at-1',
      writeDivisions: [123456],
    })

    await runCmd(ConfigUnsetCommand, ['write_divisions', '--profile', 'dev'])

    expect(getProfileConfig('dev', 'write_divisions')).toBeUndefined()
    expect(mocks.withLock).toHaveBeenCalledWith(
      'oauth-dev',
      expect.any(Function),
    )
    expect(mocks.setOAuthTokens).toHaveBeenCalledWith('dev', {
      accessToken: 'at-1',
    })
  })

  it('clears a list that only the keychain blob still carries', async () => {
    // An empty config directory leaves the blob as the only carrier.
    mocks.getOAuthTokens.mockResolvedValue({
      accessToken: 'at-1',
      writeDivisions: [123456],
    })

    await runCmd(ConfigUnsetCommand, ['write_divisions'])

    expect(mocks.setOAuthTokens).toHaveBeenCalledWith('default', {
      accessToken: 'at-1',
    })
  })

  it('leaves the keychain alone for any other key or without a blob', async () => {
    setProfileConfig('default', 'default_output', 'json')
    await runCmd(ConfigUnsetCommand, ['default_output'])
    setProfileConfig('default', 'write_divisions', [1])
    await runCmd(ConfigUnsetCommand, ['write_divisions'])

    expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
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
