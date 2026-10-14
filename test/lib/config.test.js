import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate the conf store to a throwaway dir BEFORE importing config.js, so
// these tests never read or mutate the developer's real exactcli profiles.
const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-config-test-'))
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const {
  PROFILE_NAME_RE,
  normalizeDomain,
  getConf,
  getActiveProfile,
  setActiveProfile,
  loadConfig,
  setProfileConfig,
  getProfileConfig,
  getAllProfiles,
  getProfileData,
  deleteProfileConfig,
} = await import('../../src/lib/config.js')

describe('config', () => {
  beforeAll(() => {
    // Confirm the isolation actually took effect - guard against a regression
    // that would point the tests back at the real config store.
    expect(getConf().path).toContain(TMP_CONFIG_DIR)
  })

  afterAll(() => {
    delete process.env.EXACTCLI_CONFIG_DIR
    rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  })

  afterEach(() => {
    // Clean up any test profiles we created
    const conf = getConf()
    conf.set('activeProfile', 'default')
    conf.delete('profiles.test-profile')
    conf.delete('profiles.alpha')
    conf.delete('profiles.beta')
  })

  describe('PROFILE_NAME_RE', () => {
    it.each(['default', 'acme', 'acme.1', 'a_b-c'])('accepts %o', (name) => {
      expect(PROFILE_NAME_RE.test(name)).toBe(true)
    })

    it.each(['', '../evil', 'a/b', 'a b', 'a\\b'])('rejects %o', (name) => {
      expect(PROFILE_NAME_RE.test(name)).toBe(false)
    })
  })

  describe('normalizeDomain', () => {
    it.each([
      ['acme.ngrok-free.app', 'acme.ngrok-free.app'],
      ['https://acme.ngrok-free.app', 'acme.ngrok-free.app'],
      ['  https://acme.ngrok-free.app/  ', 'acme.ngrok-free.app'],
      ['http://acme.ngrok-free.app/', 'acme.ngrok-free.app'],
      ['HTTPS://acme.ngrok-free.app//', 'acme.ngrok-free.app'],
      ['', ''],
    ])('turns %o into %o', (raw, expected) => {
      expect(normalizeDomain(raw)).toBe(expected)
    })
  })

  describe('getConf', () => {
    it('returns a Conf instance with expected methods', () => {
      const conf = getConf()
      expect(conf).toBeDefined()
      expect(typeof conf.get).toBe('function')
      expect(typeof conf.set).toBe('function')
      expect(typeof conf.delete).toBe('function')
    })

    it('returns the same instance on repeated calls', () => {
      const a = getConf()
      const b = getConf()
      expect(a).toBe(b)
    })
  })

  describe('getActiveProfile / setActiveProfile', () => {
    it('returns "default" initially', () => {
      expect(getActiveProfile()).toBe('default')
    })

    it('changes the active profile with setActiveProfile', () => {
      setActiveProfile('test-profile')
      expect(getActiveProfile()).toBe('test-profile')
    })
  })

  describe('loadConfig', () => {
    it('returns activeProfile in the result', () => {
      const cfg = loadConfig()
      expect(cfg).toHaveProperty('activeProfile')
      expect(cfg.activeProfile).toBe(getActiveProfile())
    })

    it('uses profileFlag when provided', () => {
      const cfg = loadConfig('test-profile')
      expect(cfg.activeProfile).toBe('test-profile')
    })

    it('includes profile data in the returned object', () => {
      setProfileConfig('test-profile', 'division', 123456)
      const cfg = loadConfig('test-profile')
      expect(cfg.activeProfile).toBe('test-profile')
      expect(cfg.division).toBe(123456)
    })
  })

  describe('setProfileConfig / getProfileConfig', () => {
    it('round-trips a string value correctly', () => {
      setProfileConfig('test-profile', 'host', 'start.exactonline.be')
      expect(getProfileConfig('test-profile', 'host')).toBe(
        'start.exactonline.be',
      )
    })

    it('round-trips a numeric value correctly', () => {
      setProfileConfig('test-profile', 'timeout_ms', 5000)
      expect(getProfileConfig('test-profile', 'timeout_ms')).toBe(5000)
    })

    it('returns undefined for a key that does not exist', () => {
      expect(getProfileConfig('test-profile', 'nonexistent')).toBeUndefined()
    })
  })

  describe('getProfileData', () => {
    it('returns all data for a profile', () => {
      setProfileConfig('test-profile', 'host', 'start.exactonline.be')
      setProfileConfig('test-profile', 'default_output', 'json')
      expect(getProfileData('test-profile')).toEqual({
        host: 'start.exactonline.be',
        default_output: 'json',
      })
    })

    it('returns an empty object for a profile that does not exist', () => {
      expect(getProfileData('nonexistent-profile')).toEqual({})
    })
  })

  describe('getAllProfiles', () => {
    it('returns an object containing all profiles', () => {
      setProfileConfig('alpha', 'host', 'start.exactonline.be')
      setProfileConfig('beta', 'host', 'start.exactonline.nl')
      const profiles = getAllProfiles()
      expect(profiles).toHaveProperty('alpha')
      expect(profiles).toHaveProperty('beta')
      expect(profiles.alpha.host).toBe('start.exactonline.be')
      expect(profiles.beta.host).toBe('start.exactonline.nl')
    })
  })

  describe('deleteProfileConfig', () => {
    it('removes a specific key from a profile', () => {
      setProfileConfig('test-profile', 'toRemove', 'value')
      expect(getProfileConfig('test-profile', 'toRemove')).toBe('value')
      deleteProfileConfig('test-profile', 'toRemove')
      expect(getProfileConfig('test-profile', 'toRemove')).toBeUndefined()
    })
  })
})
