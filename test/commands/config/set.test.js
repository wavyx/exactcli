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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-config-set-test-'))
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

const { getConf, getProfileConfig } = await import('../../../src/lib/config.js')
const { default: ConfigSetCommand } =
  await import('../../../src/commands/config/set.js')
const { runCmd } = await import('../../helpers.js')

const BLOB = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  obtainedAt: 1_750_000_000_000,
  expiresAt: 1_750_000_600_000,
  clientId: 'cid',
  clientSecret: 'csec',
}

describe('config set', () => {
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

  it('rejects an unknown key with exit 64', async () => {
    const err = await ConfigSetCommand.run(['bogus', 'x']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toBe(
      'Unknown config key bogus. Allowed: host, ngrok_domain, division, default_output, read_only, write_divisions',
    )
    expect(getProfileConfig('default', 'bogus')).toBeUndefined()
  })

  it('emits { profile, key, value } as json', async () => {
    const stdout = await runCmd(ConfigSetCommand, [
      'division',
      '123456',
      '--output',
      'json',
    ])

    expect(JSON.parse(stdout)).toEqual({
      profile: 'default',
      key: 'division',
      value: 123456,
    })
  })

  describe('host', () => {
    it('stores a valid Exact Online host', async () => {
      const stdout = await runCmd(ConfigSetCommand, [
        'host',
        'start.exactonline.nl',
      ])

      expect(getProfileConfig('default', 'host')).toBe('start.exactonline.nl')
      expect(stdout).toContain('host')
      expect(stdout).toContain('start.exactonline.nl')
      expect(mocks.getOAuthTokens).not.toHaveBeenCalled()
    })

    it.each([
      'start.exactonline.be',
      'start.exactonline.nl',
      'start.exactonline.de',
      'start.exactonline.co.uk',
      'start.exactonline.com',
      'start.exactonline.es',
      'start.exactonline.fr',
    ])('accepts host %s', async (host) => {
      await runCmd(ConfigSetCommand, ['host', host])

      expect(getProfileConfig('default', 'host')).toBe(host)
    })

    it('rejects an unsupported host with exit 64', async () => {
      const err = await ConfigSetCommand.run([
        'host',
        'evil.example.com',
      ]).catch((e) => e)

      expect(err.exitCode ?? err.oclif?.exit).toBe(64)
      expect(getProfileConfig('default', 'host')).toBeUndefined()
    })
  })

  describe('division', () => {
    it('stores the value as a Number', async () => {
      await runCmd(ConfigSetCommand, ['division', '123456'])

      expect(getProfileConfig('default', 'division')).toBe(123456)
    })

    it.each(['0', '-5', '1.5', 'abc', ''])(
      'rejects invalid division %s with exit 64',
      async (value) => {
        const err = await ConfigSetCommand.run(['division', value]).catch(
          (e) => e,
        )

        expect(err.exitCode ?? err.oclif?.exit).toBe(64)
        expect(getProfileConfig('default', 'division')).toBeUndefined()
      },
    )
  })

  describe('default_output', () => {
    it.each(['table', 'json', 'yaml', 'csv'])('accepts %s', async (fmt) => {
      await runCmd(ConfigSetCommand, ['default_output', fmt])

      expect(getProfileConfig('default', 'default_output')).toBe(fmt)
    })

    it('rejects an unsupported format with exit 64', async () => {
      const err = await ConfigSetCommand.run(['default_output', 'xml']).catch(
        (e) => e,
      )

      expect(err.exitCode ?? err.oclif?.exit).toBe(64)
      expect(err.message).toMatch(/table.*json.*yaml.*csv/)
      expect(getProfileConfig('default', 'default_output')).toBeUndefined()
    })
  })

  describe('ngrok_domain', () => {
    it('stores the value as given', async () => {
      await runCmd(ConfigSetCommand, ['ngrok_domain', 'abc123.ngrok.app'])

      expect(getProfileConfig('default', 'ngrok_domain')).toBe(
        'abc123.ngrok.app',
      )
    })

    it('trims whitespace and strips a leading https:// and trailing /', async () => {
      await runCmd(ConfigSetCommand, [
        'ngrok_domain',
        '  https://abc123.ngrok.app/  ',
      ])

      expect(getProfileConfig('default', 'ngrok_domain')).toBe(
        'abc123.ngrok.app',
      )
    })
  })

  describe('read_only', () => {
    it('stores true or false as a boolean', async () => {
      await runCmd(ConfigSetCommand, ['read_only', 'true'])
      expect(getProfileConfig('default', 'read_only')).toBe(true)
      await runCmd(ConfigSetCommand, ['read_only', 'false'])
      expect(getProfileConfig('default', 'read_only')).toBe(false)
    })

    it('rejects any other value with exit 64', async () => {
      process.stdout.isTTY = true
      const err = await ConfigSetCommand.run(['read_only', 'yes']).catch(
        (e) => e,
      )
      expect(err.exitCode ?? err.oclif?.exit).toBe(64)
      expect(err.message).toMatch(/read_only must be true or false/)
      expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
    })

    it('writes the lock into the keychain blob of the profile', async () => {
      // The config store follows EXACTCLI_CONFIG_DIR, the blob does not, so
      // the blob is the carrier that an empty config directory cannot drop.
      mocks.getOAuthTokens.mockResolvedValue({ ...BLOB })

      await runCmd(ConfigSetCommand, ['read_only', 'true', '--profile', 'prod'])

      expect(mocks.getOAuthTokens).toHaveBeenCalledWith('prod')
      expect(mocks.setOAuthTokens).toHaveBeenCalledWith('prod', {
        ...BLOB,
        readOnly: true,
      })
      expect(getProfileConfig('prod', 'read_only')).toBe(true)
    })

    it('clears the lock in the blob for false', async () => {
      mocks.getOAuthTokens.mockResolvedValue({ ...BLOB, readOnly: true })

      await runCmd(ConfigSetCommand, ['read_only', 'false'])

      expect(mocks.setOAuthTokens).toHaveBeenCalledWith('default', {
        ...BLOB,
        readOnly: false,
      })
    })

    it('rewrites the blob under the oauth lock of the profile', async () => {
      // A refresh in a sibling process rotates the same blob. A stale copy
      // written over it would spend the refresh token twice.
      mocks.getOAuthTokens.mockResolvedValue({ ...BLOB })
      mocks.withLock.mockImplementation(async (_name, fn) => {
        expect(mocks.getOAuthTokens).not.toHaveBeenCalled()
        await fn()
        expect(mocks.setOAuthTokens).toHaveBeenCalled()
      })

      await runCmd(ConfigSetCommand, ['read_only', 'true', '--profile', 'prod'])

      expect(mocks.withLock).toHaveBeenCalledWith(
        'oauth-prod',
        expect.any(Function),
      )
    })

    it('leaves the keychain alone when the profile has no blob', async () => {
      await runCmd(ConfigSetCommand, ['read_only', 'true'])

      expect(mocks.getOAuthTokens).toHaveBeenCalledWith('default')
      expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
      expect(getProfileConfig('default', 'read_only')).toBe(true)
    })
  })

  describe('write_divisions', () => {
    it('stores the division codes as a list of numbers', async () => {
      await runCmd(ConfigSetCommand, ['write_divisions', '123456'])
      expect(getProfileConfig('default', 'write_divisions')).toEqual([123456])

      await runCmd(ConfigSetCommand, ['write_divisions', '123456, 42'])
      expect(getProfileConfig('default', 'write_divisions')).toEqual([
        123456, 42,
      ])
    })

    it('rejects anything but positive division codes with exit 64', async () => {
      process.stdout.isTTY = true
      for (const value of [
        'abc',
        '',
        '0',
        '1,,2',
        '12a',
        '-5',
        '9007199254740993',
      ]) {
        const err = await ConfigSetCommand.run([
          'write_divisions',
          value,
        ]).catch((e) => e)
        expect(err.exitCode ?? err.oclif?.exit).toBe(64)
        expect(err.message).toMatch(
          /write_divisions must list division codes separated by commas/,
        )
      }
      expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
    })

    it('writes the list into the keychain blob under the oauth lock', async () => {
      mocks.getOAuthTokens.mockResolvedValue({ ...BLOB, readOnly: true })

      await runCmd(ConfigSetCommand, [
        'write_divisions',
        '123456',
        '--profile',
        'dev',
      ])

      expect(mocks.withLock).toHaveBeenCalledWith(
        'oauth-dev',
        expect.any(Function),
      )
      expect(mocks.setOAuthTokens).toHaveBeenCalledWith('dev', {
        ...BLOB,
        readOnly: true,
        writeDivisions: [123456],
      })
    })
  })
})
