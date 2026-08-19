import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate the conf store to a throwaway dir BEFORE importing config.js, so
// these tests never read or mutate the developer's real exactcli profiles.
const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-profile-list-test-'),
)
process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR

const mockGetOAuthTokens = vi.fn()
vi.mock('../../../src/lib/keychain.js', () => ({
  getOAuthTokens: mockGetOAuthTokens,
}))

const { getConf, setActiveProfile, setProfileConfig } =
  await import('../../../src/lib/config.js')
const { default: ProfileListCommand } =
  await import('../../../src/commands/profile/list.js')
const { runCmd } = await import('../../helpers.js')

describe('profile list', () => {
  beforeAll(() => {
    // Confirm the isolation actually took effect.
    expect(getConf().path).toContain(TMP_CONFIG_DIR)
  })

  afterAll(() => {
    delete process.env.EXACTCLI_CONFIG_DIR
    rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    getConf().clear()
    mockGetOAuthTokens.mockReset()
    mockGetOAuthTokens.mockResolvedValue(null)
  })

  it('marks the active profile and shows the authenticated state', async () => {
    setActiveProfile('default')
    setProfileConfig('default', 'host', 'start.exactonline.be')
    setProfileConfig('default', 'division', 123456)
    setProfileConfig('work', 'host', 'start.exactonline.nl')
    mockGetOAuthTokens.mockImplementation(async (profile) =>
      profile === 'default' ? { accessToken: 'tok' } : null,
    )

    const stdout = await runCmd(ProfileListCommand)

    expect(stdout).toContain('default')
    expect(stdout).toContain('work')
    expect(stdout).toContain('yes')
    expect(stdout).toContain('start.exactonline.be')
    expect(stdout).toContain('123456')
  })

  it('adds the active profile when it is authenticated but unconfigured', async () => {
    setActiveProfile('fresh')
    mockGetOAuthTokens.mockImplementation(async (profile) =>
      profile === 'fresh' ? { accessToken: 'tok' } : null,
    )

    const stdout = await runCmd(ProfileListCommand)

    expect(stdout).toContain('fresh')
  })

  it('suggests auth login when no profiles exist and the format is table', async () => {
    const stdout = await runCmd(ProfileListCommand)

    expect(stdout).toContain('exactcli auth login')
  })

  it('emits an empty list instead of the hint for machine formats', async () => {
    const stdout = await runCmd(ProfileListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([])
  })

  it('emits objects with name, active, authenticated, host, division as json', async () => {
    setActiveProfile('default')
    setProfileConfig('default', 'host', 'start.exactonline.be')
    setProfileConfig('default', 'division', 123456)
    mockGetOAuthTokens.mockImplementation(async (profile) =>
      profile === 'default' ? { accessToken: 'tok' } : null,
    )

    const stdout = await runCmd(ProfileListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([
      {
        name: 'default',
        active: true,
        authenticated: true,
        host: 'start.exactonline.be',
        division: 123456,
      },
    ])
  })

  it('marks a non-active, unauthenticated profile correctly as json', async () => {
    setActiveProfile('default')
    setProfileConfig('work', 'host', 'start.exactonline.nl')

    const stdout = await runCmd(ProfileListCommand, ['--output', 'json'])

    expect(JSON.parse(stdout)).toEqual([
      {
        name: 'work',
        active: false,
        authenticated: false,
        host: 'start.exactonline.nl',
        division: undefined,
      },
    ])
  })
})
