import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-config-set-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const { getConf, getProfileConfig } = await import('../../../src/lib/config.js')
const { default: ConfigSetCommand } =
  await import('../../../src/commands/config/set.js')
const { runCmd } = await import('../../helpers.js')

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
  })

  it('rejects an unknown key with exit 64', async () => {
    const err = await ConfigSetCommand.run(['bogus', 'x']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toBe(
      'Unknown config key bogus. Allowed: host, ngrok_domain, division, default_output',
    )
    expect(getProfileConfig('default', 'bogus')).toBeUndefined()
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
})
