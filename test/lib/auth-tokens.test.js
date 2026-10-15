import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import {
  authUrl,
  exchangeCode,
  fetchMe,
  getValidOAuthAccess,
  readOnlyCredential,
  refreshAccessToken,
  resolveCredentials,
  tokenRequest,
  REFRESH_AFTER_MS,
  REFRESH_FLOOR_MS,
  STATE_REQUIRED,
  TOKEN_TIMEOUT_MS,
} from '../../src/lib/auth.js'
import { ApiError, CliError } from '../../src/lib/errors.js'
import { HOST, mockApi, mockTokenExchange } from '../helpers.js'

const { keychain, config, lock } = vi.hoisted(() => ({
  keychain: {
    getOAuthTokens: vi.fn(),
    setOAuthTokens: vi.fn(),
    isKeychainAvailable: vi.fn(() => true),
  },
  config: { getProfileConfig: vi.fn() },
  lock: { withLock: vi.fn((name, fn) => fn()) },
}))

vi.mock('../../src/lib/keychain.js', () => keychain)
vi.mock('../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...config,
}))
vi.mock('../../src/lib/lock.js', () => lock)

const TOKEN_PATH = '/api/oauth2/token'
const SECRET = 'super-secret'
const NOW = 1_700_000_000_000

/** A stored blob obtained `ageMs` ago. */
function blob(ageMs, overrides = {}) {
  return {
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    obtainedAt: NOW - ageMs,
    expiresAt: NOW - ageMs + 600_000,
    clientId: 'cid',
    clientSecret: SECRET,
    ...overrides,
  }
}

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
  keychain.getOAuthTokens.mockReset()
  keychain.setOAuthTokens.mockReset()
  keychain.isKeychainAvailable.mockReset().mockReturnValue(true)
  config.getProfileConfig.mockReset()
  lock.withLock.mockClear()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  delete process.env.EXACTCLI_ACCESS_TOKEN
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
  delete process.env.EXACTCLI_ACCESS_TOKEN
})

describe('STATE_REQUIRED', () => {
  it('is on: a live login showed that Exact echoes state', () => {
    expect(STATE_REQUIRED).toBe(true)
  })
})

describe('authUrl', () => {
  it('builds the authorization URL with the documented parameters', () => {
    const url = new URL(
      authUrl(HOST, {
        clientId: 'cid',
        redirectUri: 'https://acme.example/callback',
        state: 'st4te',
      }),
    )

    expect(url.origin).toBe(`https://${HOST}`)
    expect(url.pathname).toBe('/api/oauth2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://acme.example/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('force_login')).toBe('0')
    expect(url.searchParams.get('state')).toBe('st4te')
  })

  it('forces the login form when asked', () => {
    const url = new URL(
      authUrl(HOST, {
        clientId: 'cid',
        redirectUri: 'https://acme.example/callback',
        forceLogin: true,
      }),
    )
    expect(url.searchParams.get('force_login')).toBe('1')
  })

  it('percent-encodes the redirect URI', () => {
    const url = authUrl(HOST, {
      clientId: 'c id',
      redirectUri: 'https://acme.example/callback?a=b',
      state: 's',
    })

    expect(url).toContain('client_id=c+id')
    expect(url).toContain(
      'redirect_uri=https%3A%2F%2Facme.example%2Fcallback%3Fa%3Db',
    )
  })

  it('generates a state when the caller has none', () => {
    const url = new URL(
      authUrl(HOST, {
        clientId: 'cid',
        redirectUri: 'https://acme.example/callback',
      }),
    )

    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('tokenRequest', () => {
  it('posts a form body with the client credentials and no auth header', async () => {
    const { scope, captured } = mockTokenExchange()

    const tokens = await tokenRequest(HOST, {
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'cid',
      client_secret: SECRET,
    })

    expect(scope.isDone()).toBe(true)
    expect(captured).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'cid',
      client_secret: SECRET,
    })
    expect(tokens).toEqual({
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresIn: 600,
    })
  })

  it('sends the form content type and asks for JSON, without Basic auth', async () => {
    // Exact reads the credentials from the body. A Basic header would be a
    // second copy of the secret on the wire.
    const scope = nock(`https://${HOST}`, { badheaders: ['authorization'] })
      .post(TOKEN_PATH)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .matchHeader('accept', 'application/json')
      .reply(200, { access_token: 'a', refresh_token: 'r', expires_in: '600' })

    await tokenRequest(HOST, { grant_type: 'refresh_token' })

    expect(scope.isDone()).toBe(true)
  })

  it('turns the expires_in string into a number', async () => {
    mockTokenExchange({ expires_in: '600' })

    const tokens = await tokenRequest(HOST, { grant_type: 'refresh_token' })

    expect(tokens.expiresIn).toBe(600)
    expect(typeof tokens.expiresIn).toBe('number')
  })

  it('falls back to 600 s when expires_in is absent or not a number', async () => {
    mockTokenExchange({ expires_in: undefined })
    expect((await tokenRequest(HOST, {})).expiresIn).toBe(600)

    mockTokenExchange({ expires_in: 'soon' })
    expect((await tokenRequest(HOST, {})).expiresIn).toBe(600)
  })

  it('throws an ApiError on a non-2xx answer', async () => {
    mockApi()
      .post(TOKEN_PATH)
      .reply(400, { error: 'invalid_grant', error_description: 'spent' })

    const err = await tokenRequest(HOST, {}).catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(400)
    expect(err.path).toBe(TOKEN_PATH)
    expect(err.message).toMatch(/spent/)
  })

  it('turns a network failure into a 69 service error', async () => {
    mockApi().post(TOKEN_PATH).replyWithError(new Error('socket hang up'))

    const err = await tokenRequest(HOST, {}).catch((e) => e)

    expect(err.exitCode).toBe(69)
    expect(err.message).toMatch(/token endpoint/i)
  })

  it('refuses a host outside the allowlist before it sends the secret', async () => {
    const err = await tokenRequest('evil.example.com', {
      client_secret: SECRET,
    }).catch((e) => e)

    expect(err.exitCode).toBe(78)
    expect(err.message).toMatch(/not an Exact Online host/)
    expect(err.message).not.toContain(SECRET)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('bounds the request well below the 60 s stale-lock threshold', () => {
    expect(TOKEN_TIMEOUT_MS).toBe(30_000)
  })

  it('sends the request with a timeout signal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockTokenExchange()

    await tokenRequest(HOST, { grant_type: 'refresh_token' })

    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it.each(['TimeoutError', 'AbortError'])(
    'maps a %s on a stalled endpoint to a 69 service error',
    async (name) => {
      // A stalled endpoint that outlives the stale-lock threshold lets a
      // second process claim the lock and spend the same refresh token.
      const abort = Object.assign(new Error('aborted'), { name })
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort)

      const err = await tokenRequest(HOST, {}).catch((e) => e)

      expect(err).toBeInstanceOf(CliError)
      expect(err.exitCode).toBe(69)
      expect(err.message).toBe('Token endpoint timed out after 30 s')
      expect(err.cause).toBe(abort)
    },
  )
})

describe('exchangeCode', () => {
  it('sends the authorization-code grant with the redirect URI', async () => {
    const { scope, captured } = mockTokenExchange()

    const tokens = await exchangeCode({
      host: HOST,
      code: 'the-code',
      clientId: 'cid',
      clientSecret: SECRET,
      redirectUri: 'https://acme.example/callback',
    })

    expect(scope.isDone()).toBe(true)
    expect(captured).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: 'https://acme.example/callback',
      client_id: 'cid',
      client_secret: SECRET,
    })
    expect(tokens.accessToken).toBe('acc')
  })

  it('decodes a percent-encoded code', async () => {
    const { captured } = mockTokenExchange()

    await exchangeCode({
      host: HOST,
      code: 'ab%21cd%21',
      clientId: 'cid',
      clientSecret: SECRET,
      redirectUri: 'https://acme.example/callback',
    })

    expect(captured.code).toBe('ab!cd!')
  })

  it('leaves an already decoded code alone', async () => {
    const { captured } = mockTokenExchange()

    await exchangeCode({
      host: HOST,
      code: '100%pure',
      decode: false,
      clientId: 'cid',
      clientSecret: SECRET,
      redirectUri: 'https://acme.example/callback',
    })

    expect(captured.code).toBe('100%pure')
  })

  it('refuses a malformed escape with exit 64', async () => {
    const { scope } = mockTokenExchange()

    const err = await exchangeCode({
      host: HOST,
      code: '100%pure',
      clientId: 'cid',
      clientSecret: SECRET,
      redirectUri: 'https://acme.example/callback',
    }).catch((e) => e)

    expect(err.exitCode).toBe(64)
    expect(err.message).toBe('Invalid authorization code')
    expect(err.message).not.toContain('100%pure')
    expect(scope.isDone()).toBe(false)
  })
})

describe('refreshAccessToken', () => {
  it('sends the refresh grant with the client credentials', async () => {
    const { scope, captured } = mockTokenExchange()

    const tokens = await refreshAccessToken({
      host: HOST,
      refreshToken: 'old-refresh',
      clientId: 'cid',
      clientSecret: SECRET,
    })

    expect(scope.isDone()).toBe(true)
    expect(captured).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
      client_id: 'cid',
      client_secret: SECRET,
    })
    expect(tokens.refreshToken).toBe('ref')
  })

  it('maps a spent refresh token (400) to exit 77 with re-auth guidance', async () => {
    mockApi()
      .post(TOKEN_PATH)
      .reply(400, { error: 'invalid_grant', error_description: 'expired' })

    const err = await refreshAccessToken({
      host: HOST,
      refreshToken: 'old-refresh',
      clientId: 'cid',
      clientSecret: SECRET,
    }).catch((e) => e)

    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/OAuth token refresh failed \(.*expired.*\)/)
    expect(err.message).toMatch(/Run: exactcli auth login/)
    expect(err.cause.statusCode).toBe(400)
  })

  it('keeps the refresh token and the client secret out of the message', async () => {
    mockApi().post(TOKEN_PATH).reply(401, { error: 'invalid_client' })

    const err = await refreshAccessToken({
      host: HOST,
      refreshToken: 'old-refresh',
      clientId: 'cid',
      clientSecret: SECRET,
    }).catch((e) => e)

    expect(err.exitCode).toBe(77)
    expect(err.message).not.toContain('old-refresh')
    expect(err.message).not.toContain(SECRET)
  })

  it('lets a 5xx through as a service error (69, not 77)', async () => {
    mockApi().post(TOKEN_PATH).reply(503, { error: 'unavailable' })

    const err = await refreshAccessToken({
      host: HOST,
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: SECRET,
    }).catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.exitCode).toBe(69)
  })

  it('lets a network failure through as a service error', async () => {
    mockApi().post(TOKEN_PATH).replyWithError(new Error('boom'))

    const err = await refreshAccessToken({
      host: HOST,
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: SECRET,
    }).catch((e) => e)

    expect(err.exitCode).toBe(69)
  })
})

describe('refresh window constants', () => {
  it('refreshes after 575 s and never below the 570 s floor', () => {
    expect(REFRESH_AFTER_MS).toBe(575_000)
    expect(REFRESH_FLOOR_MS).toBe(570_000)
  })
})

describe('getValidOAuthAccess', () => {
  it('demands a login when the keychain holds no tokens', async () => {
    keychain.getOAuthTokens.mockResolvedValue(null)

    const err = await getValidOAuthAccess('default').catch((e) => e)

    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/Run: exactcli auth login/)
    expect(lock.withLock).not.toHaveBeenCalled()
  })

  it('returns the stored blob while the access token is young', async () => {
    const stored = blob(574_999)
    keychain.getOAuthTokens.mockResolvedValue(stored)

    const access = await getValidOAuthAccess('default')

    expect(access).toBe(stored)
    expect(lock.withLock).not.toHaveBeenCalled()
    expect(keychain.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('refreshes under the oauth lock once the token reaches 575 s', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(575_000))
    const { scope, captured } = mockTokenExchange()

    const access = await getValidOAuthAccess('acme')

    expect(scope.isDone()).toBe(true)
    expect(captured.refresh_token).toBe('stored-refresh')
    expect(lock.withLock).toHaveBeenCalledWith(
      'oauth-acme',
      expect.any(Function),
    )
    expect(access).toEqual({
      accessToken: 'acc',
      refreshToken: 'ref',
      obtainedAt: NOW,
      expiresAt: NOW + 600_000,
      clientId: 'cid',
      clientSecret: SECRET,
    })
    expect(keychain.setOAuthTokens).toHaveBeenCalledWith('acme', access)
  })

  it('refuses a forced refresh below the 570 s floor', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(569_999))

    const err = await getValidOAuthAccess('default', { force: true }).catch(
      (e) => e,
    )

    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/before its refresh window/)
    expect(lock.withLock).not.toHaveBeenCalled()
  })

  it('allows a forced refresh between the floor and the refresh age', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(572_000))
    const { scope } = mockTokenExchange()

    const access = await getValidOAuthAccess('default', { force: true })

    expect(scope.isDone()).toBe(true)
    expect(access.accessToken).toBe('acc')
  })

  it('returns the stored blob when a sibling rotated the rejected token', async () => {
    // The 401 hit an older token. The keychain holds a young replacement
    // already, so the floor does not apply and nothing is spent.
    const rotated = blob(1000, { accessToken: 'sibling-access' })
    keychain.getOAuthTokens.mockResolvedValue(rotated)
    const { scope } = mockTokenExchange()

    const access = await getValidOAuthAccess('default', {
      force: true,
      rejected: 'stored-access',
    })

    expect(access).toBe(rotated)
    expect(scope.isDone()).toBe(false)
    expect(lock.withLock).not.toHaveBeenCalled()
  })

  it('applies the floor when the stored token is the rejected one', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(569_999))

    const err = await getValidOAuthAccess('default', {
      force: true,
      rejected: 'stored-access',
    }).catch((e) => e)

    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/before its refresh window/)
    expect(lock.withLock).not.toHaveBeenCalled()
  })

  it('refreshes the rejected token once it passed the floor', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(572_000))
    const { scope } = mockTokenExchange()

    const access = await getValidOAuthAccess('default', {
      force: true,
      rejected: 'stored-access',
    })

    expect(scope.isDone()).toBe(true)
    expect(access.accessToken).toBe('acc')
  })

  it('keeps the read-only lock of the blob on a rotation', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(600_000, { readOnly: true }))
    mockTokenExchange()

    const access = await getValidOAuthAccess('default')

    expect(access.readOnly).toBe(true)
    expect(keychain.setOAuthTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ accessToken: 'acc', readOnly: true }),
    )
  })

  it('spends no refresh token when another process refreshed first', async () => {
    const stale = blob(600_000)
    const fresh = blob(0, { accessToken: 'other-process' })
    keychain.getOAuthTokens
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(fresh)
    const { scope } = mockTokenExchange()

    const access = await getValidOAuthAccess('default')

    expect(access).toBe(fresh)
    expect(scope.isDone()).toBe(false)
    expect(keychain.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('refreshes when the re-read finds the same blob', async () => {
    const stale = blob(600_000)
    keychain.getOAuthTokens.mockResolvedValue(stale)
    const { scope } = mockTokenExchange()

    const access = await getValidOAuthAccess('default')

    expect(scope.isDone()).toBe(true)
    expect(access.accessToken).toBe('acc')
  })

  it('demands a login when the blob disappeared before the lock', async () => {
    // A sibling process logged out. Refreshing here would resurrect the blob.
    keychain.getOAuthTokens
      .mockResolvedValueOnce(blob(600_000))
      .mockResolvedValueOnce(null)
    const { scope } = mockTokenExchange()

    const err = await getValidOAuthAccess('default').catch((e) => e)

    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/Not authenticated/)
    expect(scope.isDone()).toBe(false)
    expect(keychain.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('spends the re-read refresh token, not the pre-lock snapshot', async () => {
    // Same obtainedAt, different credentials: `auth login` rewrote the blob
    // while this process waited for the lock.
    const before = blob(600_000)
    const rewritten = blob(600_000, {
      refreshToken: 'rotated-refresh',
      clientId: 'new-cid',
      clientSecret: 'new-secret',
    })
    keychain.getOAuthTokens
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(rewritten)
    const { captured } = mockTokenExchange()

    const access = await getValidOAuthAccess('default')

    expect(captured.refresh_token).toBe('rotated-refresh')
    expect(captured.client_id).toBe('new-cid')
    expect(captured.client_secret).toBe('new-secret')
    expect(access.clientId).toBe('new-cid')
    expect(access.clientSecret).toBe('new-secret')
  })

  it('refuses to spend the refresh token when the keychain cannot store it', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(600_000))
    keychain.isKeychainAvailable.mockReturnValue(false)
    const { scope } = mockTokenExchange()

    const err = await getValidOAuthAccess('default').catch((e) => e)

    expect(err.exitCode).toBe(78)
    expect(err.message).toMatch(/keychain unavailable/i)
    expect(err.message).toMatch(/Run: exactcli auth login/)
    expect(scope.isDone()).toBe(false)
  })

  it('refreshes on the host of the profile', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(600_000))
    config.getProfileConfig.mockImplementation((profile, key) =>
      key === 'host' ? 'start.exactonline.nl' : undefined,
    )
    const scope = mockApi('start.exactonline.nl')
      .post(TOKEN_PATH)
      .reply(200, { access_token: 'nl', refresh_token: 'r', expires_in: '600' })

    const access = await getValidOAuthAccess('default')

    expect(scope.isDone()).toBe(true)
    expect(access.accessToken).toBe('nl')
  })
})

describe('resolveCredentials', () => {
  it('prefers the environment token and never reads the keychain', async () => {
    process.env.EXACTCLI_ACCESS_TOKEN = 'env-token'

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds).toEqual({
      token: 'env-token',
      source: 'env',
      host: HOST,
      readOnly: false,
    })
    expect(keychain.getOAuthTokens).not.toHaveBeenCalled()
  })

  it('falls back to the profile tokens in the keychain', async () => {
    const stored = blob(0)
    keychain.getOAuthTokens.mockResolvedValue(stored)

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds).toEqual({
      token: 'stored-access',
      source: 'profile',
      host: HOST,
      readOnly: false,
      oauth: stored,
    })
  })

  it('carries the read-only lock of the blob', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(0, { readOnly: true }))

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.readOnly).toBe(true)
  })

  it('carries the write division list of the blob', async () => {
    keychain.getOAuthTokens.mockResolvedValue(
      blob(0, { writeDivisions: [123456] }),
    )

    const creds = await resolveCredentials({ profile: 'default' })

    expect(creds.writeDivisions).toEqual([123456])
  })

  it('keeps the write division list of the blob on a rotation', async () => {
    keychain.getOAuthTokens.mockResolvedValue(
      blob(600_000, { writeDivisions: [123456] }),
    )
    mockTokenExchange()

    await getValidOAuthAccess('default')

    expect(keychain.setOAuthTokens).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        accessToken: 'acc',
        writeDivisions: [123456],
      }),
    )
  })

  it('reads the host from the profile configuration', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(0))
    config.getProfileConfig.mockImplementation((profile, key) =>
      key === 'host' ? 'start.exactonline.fr' : undefined,
    )

    const creds = await resolveCredentials({ profile: 'acme' })

    expect(creds.host).toBe('start.exactonline.fr')
    expect(config.getProfileConfig).toHaveBeenCalledWith('acme', 'host')
  })

  it('demands a login when the profile has no tokens', async () => {
    keychain.getOAuthTokens.mockResolvedValue(null)

    await expect(
      resolveCredentials({ profile: 'default' }),
    ).rejects.toMatchObject({ exitCode: 77 })
  })
})

describe('readOnlyCredential', () => {
  it('names the profile when its blob carries the lock', async () => {
    keychain.getOAuthTokens.mockResolvedValue(blob(0, { readOnly: true }))

    expect(await readOnlyCredential('acme')).toBe('acme')
    expect(keychain.getOAuthTokens).toHaveBeenCalledWith('acme')
  })

  it('answers null for an unlocked blob and for no blob', async () => {
    keychain.getOAuthTokens.mockResolvedValueOnce(blob(0))
    expect(await readOnlyCredential('acme')).toBeNull()

    keychain.getOAuthTokens.mockResolvedValueOnce(null)
    expect(await readOnlyCredential('acme')).toBeNull()
  })
})

describe('fetchMe', () => {
  it('selects the identity fields and unwraps the results array', async () => {
    const get = vi.fn().mockResolvedValue({
      d: { results: [{ CurrentDivision: 123456, FullName: 'A Person' }] },
    })

    const me = await fetchMe({ get })

    expect(get).toHaveBeenCalledWith('/api/v1/current/Me', {
      query: { $select: 'CurrentDivision,FullName,Email' },
    })
    expect(me).toEqual({ CurrentDivision: 123456, FullName: 'A Person' })
  })

  it('returns null on an empty results array', async () => {
    const get = vi.fn().mockResolvedValue({ d: { results: [] } })

    expect(await fetchMe({ get })).toBeNull()
  })

  it('accepts a single-record envelope', async () => {
    const get = vi.fn().mockResolvedValue({ d: { CurrentDivision: 7 } })

    expect(await fetchMe({ get })).toEqual({ CurrentDivision: 7 })
  })
})
