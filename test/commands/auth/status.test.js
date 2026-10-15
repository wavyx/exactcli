import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

const DAY_MS = 86_400_000
const ME = {
  CurrentDivision: 123456,
  FullName: 'Jane Doe',
  Email: 'jane@acme.example',
}

const mocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  getValidOAuthAccess: vi.fn(),
  loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
  getProfileConfig: vi.fn(),
  getOAuthTokens: vi.fn(),
  isKeychainAvailable: vi.fn(() => true),
}))

vi.mock('../../../src/lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMe: mocks.fetchMe,
  getValidOAuthAccess: mocks.getValidOAuthAccess,
}))
vi.mock('../../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfig: mocks.loadConfig,
  getProfileConfig: mocks.getProfileConfig,
}))
vi.mock('../../../src/lib/keychain.js', () => ({
  getOAuthTokens: mocks.getOAuthTokens,
  isKeychainAvailable: mocks.isKeychainAvailable,
}))
// The real client still runs; the spy only records what the probe built.
vi.mock('../../../src/lib/client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createClient: vi.fn(actual.createClient) }
})

const { default: StatusCommand } =
  await import('../../../src/commands/auth/status.js')
const { createClient } = await import('../../../src/lib/client.js')

/** Drive getProfileConfig from a plain key/value map. */
function profile(values = {}) {
  mocks.getProfileConfig.mockImplementation((_profile, key) => values[key])
}

/** A stored token blob of the given age. */
function blob(ageMs, overrides = {}) {
  const obtainedAt = Date.now() - ageMs
  return {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    obtainedAt,
    expiresAt: obtainedAt + 600_000,
    clientId: 'cid',
    clientSecret: 'csec',
    ...overrides,
  }
}

beforeEach(() => {
  // Freeze the clock: the command reads the token age a moment after blob()
  // stamps it, and a slow start (Windows CI) would round 10 s up to 11 s.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
  mocks.isKeychainAvailable.mockReturnValue(true)
  mocks.fetchMe.mockResolvedValue(ME)
  profile({})
  mocks.getOAuthTokens.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('auth status', () => {
  it('passes --timeout to the identity probe', async () => {
    mocks.getOAuthTokens.mockResolvedValue(blob(1000))

    await runCmd(StatusCommand, ['--timeout', '1234'])

    expect(createClient.mock.calls[0][0].timeout).toBe(1234)
  })

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
    expect(stdout).not.toContain('Writes:')
    expect(stdout).not.toContain('at-1')
  })

  it('prints the lock that the credential carries', async () => {
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000, { readOnly: true }))

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Writes:             locked: read-only credential')
  })

  it('prints the divisions that writes may reach', async () => {
    profile({ write_divisions: [123456, 42] })
    mocks.getOAuthTokens.mockResolvedValue(
      blob(10_000, { writeDivisions: [123456] }),
    )

    const stdout = await runCmd(StatusCommand)

    expect(stdout).toContain('Writes:             division 123456 only')
  })

  it('names several divisions, and an empty list as a lock', async () => {
    profile({ write_divisions: [1, 2] })
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))
    expect(await runCmd(StatusCommand)).toContain(
      'Writes:             divisions 1, 2 only',
    )

    mocks.getOAuthTokens.mockResolvedValue(blob(10_000, { writeDivisions: [] }))
    expect(await runCmd(StatusCommand)).toContain(
      'Writes:             locked: no division allowed',
    )
  })

  it('emits the write division list when piped, from the config alone too', async () => {
    process.stdout.isTTY = false
    profile({ write_divisions: [123456] })

    const status = JSON.parse(await runCmd(StatusCommand))

    expect(status.writeDivisions).toEqual([123456])
  })

  it('emits the lock of the credential when piped', async () => {
    process.stdout.isTTY = false
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000, { readOnly: true }))

    const status = JSON.parse(await runCmd(StatusCommand))

    expect(status.readOnly).toBe(true)
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

  it('refreshes a token past its refresh point before the identity probe', async () => {
    process.stdout.isTTY = false
    profile({ division: 123456 })
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))
    mocks.getValidOAuthAccess.mockResolvedValue({ accessToken: 'at-fresh' })

    const status = JSON.parse(await runCmd(StatusCommand))

    expect(mocks.getValidOAuthAccess).toHaveBeenCalledWith('default')
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'at-fresh' }),
    )
    expect(status.identity).toEqual({
      fullName: 'Jane Doe',
      email: 'jane@acme.example',
    })
  })

  it('keeps a fresh token as it is for the identity probe', async () => {
    process.stdout.isTTY = false
    profile({ division: 123456 })
    mocks.getOAuthTokens.mockResolvedValue(blob(10_000))

    await runCmd(StatusCommand)

    expect(mocks.getValidOAuthAccess).not.toHaveBeenCalled()
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'at-1' }),
    )
  })

  it('emits one object when the output is piped', async () => {
    process.stdout.isTTY = false
    profile({ ngrok_domain: 'acme.ngrok-free.app', division: 123456 })
    mocks.getOAuthTokens.mockResolvedValue(blob(600_000))
    mocks.getValidOAuthAccess.mockResolvedValue({ accessToken: 'at-fresh' })

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
      readOnly: false,
      writeDivisions: null,
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
      readOnly: null,
      writeDivisions: null,
      identity: null,
    })
  })
})
