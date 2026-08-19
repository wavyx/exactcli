import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import createDebug from 'debug'
import {
  getOAuthTokens,
  isKeychainAvailable,
  setOAuthTokens,
} from './keychain.js'
import { getProfileConfig } from './config.js'
import { withLock } from './lock.js'
import { DEFAULT_HOST, HOST_RE } from './client.js'
import { unwrap } from './odata.js'
import {
  ApiError,
  AuthRequiredError,
  CliError,
  ConfigError,
  ServiceUnavailableError,
} from './errors.js'

const debug = createDebug('exact:auth')

const AUTH_PATH = '/api/oauth2/auth'
const TOKEN_PATH = '/api/oauth2/token'

/**
 * Reject a callback that carries no `state`. Exact does not document `state`
 * and may not echo it, so the guard stays off until a live login proves that
 * it comes back.
 */
export const STATE_REQUIRED = false

/** The documented lifetime of an access token, in seconds. */
const DEFAULT_EXPIRES_IN = 600

/** The access token lives 600 s. Refresh it once it reaches this age. */
export const REFRESH_AFTER_MS = 575_000
/** Exact answers 401 "Access Token not expired" below this age. */
export const REFRESH_FLOOR_MS = 570_000

/** @param {string} profile */
function profileHost(profile) {
  return getProfileConfig(profile, 'host') ?? DEFAULT_HOST
}

/** @returns {string} a fresh CSRF token */
function newState() {
  return randomBytes(16).toString('hex')
}

/**
 * Build the authorization URL the user opens in a browser.
 * @param {string} host Exact Online country host
 * @param {{ clientId: string, redirectUri: string, state?: string }} options
 * @returns {string}
 */
export function authUrl(host, { clientId, redirectUri, state = newState() }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    force_login: '0',
    state,
  })
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
  // Exact answers with a string, for example "600". An absent or unreadable
  // value must not become NaN: that would poison expiresAt in the keychain.
  const expiresIn = Number(body.expires_in)
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : DEFAULT_EXPIRES_IN,
  }
}

/**
 * The code arrives percent-encoded ("%21" for "!") when the user copies the
 * raw redirect target. A query parser already decoded it, so decoding twice
 * would mangle a literal percent sign or throw.
 * @param {string} value
 * @returns {string}
 */
function decodeCode(value) {
  if (!value.includes('%')) return value
  try {
    return decodeURIComponent(value)
  } catch {
    // The value is a secret: name the problem, never echo the code.
    throw new CliError('Invalid authorization code', { exitCode: 64 })
  }
}

/**
 * Trade an authorization code for a token set.
 * @param {{ host: string, code: string, clientId: string,
 *   clientSecret: string, redirectUri: string, decode?: boolean }} options
 *   `decode` is false when a query parser already decoded the code.
 * @returns {Promise<TokenSet>}
 */
export async function exchangeCode({
  host,
  code,
  clientId,
  clientSecret,
  redirectUri,
  decode = true,
}) {
  return tokenRequest(host, {
    grant_type: 'authorization_code',
    code: decode ? decodeCode(code) : code,
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
  // the keychain again: a sibling process may have spent it, rotated it, or
  // logged out while this process waited. Everything below works on that
  // re-read blob, never on the snapshot from before the lock.
  return withLock(`oauth-${profile}`, async () => {
    const base = await getOAuthTokens(profile)
    if (!base) throw new AuthRequiredError()
    if (base.obtainedAt > blob.obtainedAt) {
      debug('another process refreshed the token first')
      return base
    }
    if (!isKeychainAvailable()) {
      throw new ConfigError(
        'OS keychain unavailable: cannot store the rotated refresh token. ' +
          'Run: exactcli auth login',
      )
    }

    const refreshed = await refreshAccessToken({
      host: profileHost(profile),
      refreshToken: base.refreshToken,
      clientId: base.clientId,
      clientSecret: base.clientSecret,
    })
    const now = Date.now()
    const updated = {
      ...base,
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
 * Static answers for the browser. A query value never reaches the page: the
 * callback is reachable by any local page, so reflecting it would be an XSS
 * vector.
 */
const PAGE = {
  ok: 'Authenticated. You can close this window.',
  failed: 'Authorization failed. Return to the terminal.',
  state: 'State mismatch. Return to the terminal.',
  noCode: 'No authorization code. Return to the terminal.',
  exchange: 'The token exchange failed. Return to the terminal.',
}

/** @param {string} body @returns {string} */
function page(body) {
  return `<!doctype html><meta charset="utf-8"><title>exactcli</title><h2>${body}</h2>`
}

/**
 * Keep an unknown `error` value out of the terminal too: only a documented
 * OAuth error code passes.
 * @param {string} value
 * @returns {string}
 */
function errorCode(value) {
  return /^[a-z_]{1,64}$/.test(value) ? value : 'unknown'
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} body
 * @returns {Promise<void>} settles once the answer left the process
 */
function respond(res, status, body) {
  return new Promise((done) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page(body), done)
  })
}

/**
 * Run the authorization-code flow behind a loopback server. The redirect URI
 * is the public HTTPS name that Exact knows (a tunnel in front of this
 * server), so only its pathname is served here. The caller opens the browser
 * on the URL that `onReady` receives.
 *
 * @param {object} options
 * @param {string} options.host
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {string} options.redirectUri public HTTPS URI of the registration
 * @param {number} [options.port] loopback port behind the tunnel
 * @param {number} [options.timeout] ms to wait for the callback
 * @param {string} [options.state] CSRF token, generated when absent
 * @param {(url: string) => void} [options.onReady] receives the auth URL
 * @returns {Promise<TokenSet>}
 */
export function authorizationCodeFlow({
  host,
  clientId,
  clientSecret,
  redirectUri,
  port = 9999,
  timeout = 300_000,
  state = newState(),
  onReady,
}) {
  const callbackPath = new URL(redirectUri).pathname

  return new Promise((resolve, reject) => {
    function shutdown() {
      clearTimeout(timer)
      server.close()
      // Undici keeps the callback connection alive, which would hold the
      // event loop for the whole keep-alive window after close().
      server.closeAllConnections()
    }

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (req.method !== 'GET' || url.pathname !== callbackPath) {
        res.writeHead(404)
        res.end()
        return
      }

      const failure = url.searchParams.get('error')
      if (failure) {
        await respond(res, 400, PAGE.failed)
        shutdown()
        reject(
          new CliError(
            `Authorization failed (${errorCode(failure)}). Run: exactcli auth login`,
            { exitCode: 77 },
          ),
        )
        return
      }

      // A stray or replayed callback must not end the login: answer it and
      // keep waiting for the real one.
      const echoed = url.searchParams.get('state')
      const stateOk = echoed === null ? !STATE_REQUIRED : echoed === state
      if (!stateOk) {
        debug('callback with an unexpected state')
        await respond(res, 400, PAGE.state)
        return
      }

      const code = url.searchParams.get('code')
      if (!code) {
        await respond(res, 400, PAGE.noCode)
        return
      }

      try {
        const tokens = await exchangeCode({
          host,
          code,
          clientId,
          clientSecret,
          redirectUri,
          // searchParams decoded the code already.
          decode: false,
        })
        await respond(res, 200, PAGE.ok)
        shutdown()
        resolve(tokens)
      } catch (err) {
        await respond(res, 500, PAGE.exchange)
        shutdown()
        reject(
          new CliError(
            `Authorization failed (${err.message}). Run: exactcli auth login`,
            { exitCode: 77, cause: err },
          ),
        )
      }
    })

    server.on('error', (err) => {
      // A listen failure never opened the server, and close() would emit a
      // second error. An error after listen leaves a socket to close.
      if (server.listening) shutdown()
      else clearTimeout(timer)
      reject(
        new CliError(
          `Cannot start the local callback server on port ${port}: ${err.message}. ` +
            'Close whatever holds the port, or use: exactcli auth login --manual',
          { exitCode: 78 },
        ),
      )
    })

    const timer = setTimeout(() => {
      shutdown()
      reject(
        new CliError(
          `Authentication timed out after ${Math.round(timeout / 1000)}s`,
          { exitCode: 77 },
        ),
      )
    }, timeout)

    server.listen(port, '127.0.0.1', () => {
      debug('callback server listens on 127.0.0.1:%d', port)
      onReady?.(authUrl(host, { clientId, redirectUri, state }))
    })
  })
}

/** @returns {Promise<string>} */
async function defaultPrompt() {
  // Loaded on demand: the prompt library is heavy and every other command
  // pays for a top-level import.
  const { input } = await import('@inquirer/prompts')
  return input({ message: 'Paste the redirected URL or the code:' })
}

/**
 * @param {string} answer
 * @returns {{ code: string | null, decode: boolean }} `decode` is false for a
 *   pasted URL, whose query parser already decoded the code.
 */
function parseAnswer(answer) {
  try {
    return { code: new URL(answer).searchParams.get('code'), decode: false }
  } catch {
    return { code: answer, decode: true }
  }
}

/**
 * Ask for the authorization code instead of catching it on a loopback port.
 * @param {object} options
 * @param {string} options.host
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {string} options.redirectUri
 * @param {() => Promise<string>} [options.prompt]
 * @returns {Promise<TokenSet>}
 */
export async function manualCodeFlow({
  host,
  clientId,
  clientSecret,
  redirectUri,
  prompt = defaultPrompt,
}) {
  const answer = (await prompt()).trim()
  const { code, decode } = parseAnswer(answer)
  if (!code) {
    throw new CliError('No authorization code provided', { exitCode: 64 })
  }
  return exchangeCode({
    host,
    code,
    decode,
    clientId,
    clientSecret,
    redirectUri,
  })
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
