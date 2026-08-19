import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

const DAY_MS = 86_400_000
const ME = {
  CurrentDivision: 123456,
  FullName: 'Jane Doe',
  Email: 'jane@acme.example',
}

const mocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn(),
  getOAuthTokens: vi.fn(),
  isKeychainAvailable: vi.fn(() => true),
}))

vi.mock('../../../src/lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMe: mocks.fetchMe,
}))
vi.mock('../../../src/lib/config.js', () => ({
  loadConfig: mocks.loadConfig,
  getProfileConfig: mocks.getProfileConfig,
}))
vi.mock('../../../src/lib/keychain.js', () => ({
  getOAuthTokens: mocks.getOAuthTokens,
  isKeychainAvailable: mocks.isKeychainAvailable,
}))

const { default: StatusCommand } =
  await import('../../../src/commands/auth/status.js')

/** Drive getProfileConfig from a plain key/value map. */
function profile(values = {}) {
  mocks.getProfileConfig.mockImplementation((_profile, key) => values[key])
}

/** A stored token blob of the given age. */
function blob(ageMs) {
  const obtainedAt = Date.now() - ageMs
  return {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    obtainedAt,
    expiresAt: obtainedAt + 600_000,
    clientId: 'cid',
    clientSecret: 'csec',
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
  mocks.isKeychainAvailable.mockReturnValue(true)
  mocks.fetchMe.mockResolvedValue(ME)
  profile({})
  mocks.getOAuthTokens.mockResolvedValue(null)
})

describe('auth status', () => {
  it('reports a profile without credentials', async () => {
    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Profile:')
    expect(stdout).toContain('default')
    expect(stdout).toContain('OS keychain')
    expect(stdout).toContain('start.exactonline.be')
    expect(stdout).toContain('(not set)')
    expect(stdout).toContain('Not authenticated')
    expect(stdout).toContain('exactcli auth login')
    expect(stdout).not.toContain('Redirect URI')
    expect(mocks.fetchMe).not.toHaveBeenCalled()
  })

  it('reports an unavailable keychain', async () => {
    mocks.isKeychainAvailable.mockReturnValue(false)

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('unavailable')
  })

  it('reports a fresh token as not refreshable yet', async () => {
    profile({
      host: 'start.exactonline.nl',
      ngrok_domain: 'acme.ngrok-free.app',
      division: 123456,
    })
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('start.exactonline.nl')
    expect(stdout).toContain(
      'Redirect URI:       https://acme.ngrok-free.app/callback',
    )
    expect(stdout).toContain('Division:')
    expect(stdout).toContain('123456')
    expect(stdout).toContain('Token age:          10s')
    expect(stdout).toContain('Refreshable now:    no')
    expect(stdout).toContain('Refresh token idle: 0 days')
    expect(stdout).toContain('Jane Doe')
    expect(stdout).toContain('jane@acme.example')
    expect(stdout).not.toContain('Not authenticated')
    expect(stdout).not.toContain('at-1')
  })

  it('marks an aged token refreshable and warns about the idle refresh token', async () => {
    mocks.getOAuthTokens.mockResolvedValue(blob(26 * DAY_MS))

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Refreshable now:    yes')
    expect(stdout).toContain('Refresh token idle: 26 days')
    expect(stdout).toContain(
      'Refresh tokens expire after 30 days without use. Run a command or exactcli auth login soon.',
    )
  })

  it.each([
    [570_000, 'yes'],
    [569_999, 'no'],
  ])('reports an age of %d ms as refreshable %s', async (age, answer) => {
    // Freeze the clock: the boundary sits one millisecond wide.
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      mocks.getOAuthTokens.mockResolvedValue({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        obtainedAt: now - age,
        expiresAt: now - age + 600_000,
        clientId: 'cid',
        clientSecret: 'csec',
      })

      const stdout = await runCmd(StatusCommand)

      expect(stdout).toContain(`Refreshable now:    ${answer}`)
    } finally {
      clock.mockRestore()
    }
  })

  it('holds the idle warning at exactly 25 days', async () => {
    mocks.getOAuthTokens.mockResolvedValue(blob(25 * DAY_MS))

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Refresh token idle: 25 days')
    expect(stdout).not.toContain('Refresh tokens expire after 30 days')
  })

  it('stays quiet when the identity call fails', async () => {
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    mocks.fetchMe.mockRejectedValue(new Error('network down'))

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Token age:')
    expect(stdout).not.toContain('network down')
    expect(stdout).not.toContain('Name:')
  })

  it('emits one object when the output is piped', async () => {
    process.stdout.isTTY = false
    profile({ ngrok_domain: 'acme.ngrok-free.app', division: 123456 })
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))

    const stdout = await runCmd(StatusCommand)

    expect(JSON.parse(stdout)).toEqual({
      profile: 'default',
      keychain: 'OS keychain',
      host: 'start.exactonline.be',
      redirectUri: 'https://acme.ngrok-free.app/callback',
      division: 123456,
      authenticated: true,
      tokenAgeSeconds: 600,
      refreshableNow: true,
      refreshTokenIdleDays: 0,
      identity: { fullName: 'Jane Doe', email: 'jane@acme.example' },
    })
  })

  it('emits null fields when piped without credentials', async () => {
    process.stdout.isTTY = false

    const stdout = await runCmd(StatusCommand)

    expect(JSON.parse(stdout)).toMatchObject({
      authenticated: false,
      redirectUri: null,
      division: null,
      tokenAgeSeconds: null,
      refreshableNow: null,
      refreshTokenIdleDays: null,
      identity: null,
    })
  })
})
