import createDebug from 'debug'
import {
  getOAuthTokens,
  isKeychainAvailable,
  setOAuthTokens,
} from './keychain.js'
import { getProfileConfig } from './config.js'
import { withLock } from './lock.js'
import { HOST_RE } from './client.js'
import { unwrap } from './odata.js'
import {
  ApiError,
  AuthRequiredError,
  CliError,
  ConfigError,
  ServiceUnavailableError,
} from './errors.js'

const debug = createDebug('exact:auth')

const DEFAULT_HOST = 'start.exactonline.be'
const AUTH_PATH = '/api/oauth2/auth'
const TOKEN_PATH = '/api/oauth2/token'

/**
 * Reject a callback that carries no `state`. Exact does not document `state`
 * and may not echo it, so the guard stays off until a live login proves that
 * it comes back.
 */
export const STATE_REQUIRED = false

/** The access token lives 600 s. Refresh it once it reaches this age. */
export const REFRESH_AFTER_MS = 575_000
/** Exact answers 401 "Access Token not expired" below this age. */
export const REFRESH_FLOOR_MS = 570_000

/** @param {string} profile */
function profileHost(profile) {
  return getProfileConfig(profile, 'host') ?? DEFAULT_HOST
}

/**
 * Build the authorization URL the user opens in a browser.
 * @param {string} host Exact Online country host
 * @param {{ clientId: string, redirectUri: string, state?: string }} options
 * @returns {string}
 */
export function authUrl(host, { clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    force_login: '0',
  })
  if (state) params.set('state', state)
  return `https://${host}${AUTH_PATH}?${params}`
}

/**
 * @typedef {object} TokenSet
 * @property {string} accessToken
 * @property {string} refreshToken single use, rotates on every refresh
 * @property {number} expiresIn seconds
 */

/**
 * Call the token endpoint. Exact authenticates it with `client_id` and
 * `client_secret` in the form body; there is no Basic header. This request
 * carries the client secret, so the host lock applies before it goes out.
 * @param {string} host
 * @param {Record<string, string>} params form parameters
 * @returns {Promise<TokenSet>}
 */
export async function tokenRequest(host, params) {
  if (!HOST_RE.test(host)) {
    throw new ConfigError(`Host ${host} is not an Exact Online host`)
  }

  let res
  let text
  try {
    res = await fetch(`https://${host}${TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(params),
    })
    text = await res.text()
  } catch (err) {
    throw new ServiceUnavailableError(
      `Cannot reach the Exact Online token endpoint on ${host}: ${err.message}`,
      { cause: err },
    )
  }

  if (!res.ok) throw ApiError.fromResponse(res.status, text, TOKEN_PATH)

  const body = JSON.parse(text)
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // Exact answers with a string, for example "600".
    expiresIn: Number(body.expires_in),
  }
}

/**
 * Trade an authorization code for a token set.
 * @param {{ host: string, code: string, clientId: string,
 *   clientSecret: string, redirectUri: string }} options
 * @returns {Promise<TokenSet>}
 */
export async function exchangeCode({
  host,
  code,
  clientId,
  clientSecret,
  redirectUri,
}) {
  return tokenRequest(host, {
    grant_type: 'authorization_code',
    // The code arrives percent-encoded ("%21" for "!") when the user pastes
    // the raw redirect target instead of letting the callback decode it.
    code: code.includes('%') ? decodeURIComponent(code) : code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
}

/**
 * @param {{ host: string, refreshToken: string, clientId: string,
 *   clientSecret: string }} options
 * @returns {Promise<TokenSet>}
 */
export async function refreshAccessToken({
  host,
  refreshToken,
  clientId,
  clientSecret,
}) {
  debug('refresh the access token on %s', host)
  try {
    return await tokenRequest(host, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
  } catch (err) {
    // A spent or revoked refresh token answers 400 invalid_grant, a wrong
    // client answers 401. Both are auth problems (77, re-login), not bad data.
    // A 5xx or a network failure stays a service problem (69).
    if (
      err instanceof ApiError &&
      (err.statusCode === 400 || err.statusCode === 401)
    ) {
      throw new CliError(
        `OAuth token refresh failed (${err.message}). Run: exactcli auth login`,
        { exitCode: 77, cause: err },
      )
    }
    throw err
  }
}

/**
 * Return a usable token blob for the profile, refreshed when needed.
 * @param {string} profile
 * @param {{ force?: boolean }} [options] force refreshes after a 401
 * @returns {Promise<import('./keychain.js').OAuthTokens>}
 */
export async function getValidOAuthAccess(profile, { force = false } = {}) {
  const blob = await getOAuthTokens(profile)
  if (!blob) throw new AuthRequiredError()

  const age = Date.now() - blob.obtainedAt
  if (!force && age < REFRESH_AFTER_MS) return blob
  if (force && age < REFRESH_FLOOR_MS) {
    throw new CliError(
      'Access token rejected before its refresh window. Run: exactcli auth login',
      { exitCode: 77 },
    )
  }

  // The refresh token is single use. Take the cross-process lock, then read
  // the keychain again: a sibling process may have spent it in the meantime.
  return withLock(`oauth-${profile}`, async () => {
    const current = await getOAuthTokens(profile)
    if (current?.obtainedAt > blob.obtainedAt) {
      debug('another process refreshed the token first')
      return current
    }
    if (!isKeychainAvailable()) {
      throw new ConfigError(
        'OS keychain unavailable: cannot store the rotated refresh token. ' +
          'Run: exactcli auth login',
      )
    }

    const refreshed = await refreshAccessToken({
      host: profileHost(profile),
      refreshToken: blob.refreshToken,
      clientId: blob.clientId,
      clientSecret: blob.clientSecret,
    })
    const now = Date.now()
    const updated = {
      ...blob,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      obtainedAt: now,
      expiresAt: now + refreshed.expiresIn * 1000,
    }
    await setOAuthTokens(profile, updated)
    return updated
  })
}

/**
 * @typedef {object} ResolvedCredentials
 * @property {string} token bearer token for the API
 * @property {'env' | 'profile'} source
 * @property {string} host
 * @property {import('./keychain.js').OAuthTokens} [oauth] absent on the env path
 */

/**
 * @param {{ profile: string }} options
 * @returns {Promise<ResolvedCredentials>}
 */
export async function resolveCredentials({ profile }) {
  const host = profileHost(profile)

  // An explicit token wins: CI and the localhost mock have no keychain.
  const envToken = process.env.EXACTCLI_ACCESS_TOKEN
  if (envToken) {
    debug('token from EXACTCLI_ACCESS_TOKEN')
    return { token: envToken, source: 'env', host }
  }

  const blob = await getValidOAuthAccess(profile)
  return { token: blob.accessToken, source: 'profile', host, oauth: blob }
}

/**
 * Read the authenticated identity. The call is quota free.
 * @param {{ get: (path: string, options: object) => Promise<object> }} client
 * @returns {Promise<object | null>}
 */
export async function fetchMe(client) {
  const body = await client.get('/api/v1/current/Me', {
    query: { $select: 'CurrentDivision,FullName,Email' },
  })
  const data = unwrap(body)
  return Array.isArray(data) ? (data[0] ?? null) : data
}
