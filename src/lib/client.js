import createDebug from 'debug'
import {
  ApiError,
  CliError,
  ConfigError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors.js'

const debug = createDebug('exact:client')

/** The seven Exact Online country hosts. Tokens never leave one of these. */
export const HOST_RE = /^start\.exactonline\.(be|nl|de|co\.uk|com|es|fr)$/

/** The country host a profile uses when it names none. */
export const DEFAULT_HOST = 'start.exactonline.be'

/** Exact Online refuses a request URI longer than this. */
const MAX_URL_LENGTH = 6000
/** Shortest and longest rate-limit wait. The minutely window is 60 s. */
const MIN_WAIT_MS = 1000
const MAX_WAIT_MS = 65_000
/** Wait used when a 429 arrives without a reset header. */
const DEFAULT_WAIT_MS = 2000

function jitter() {
  return Math.floor(Math.random() * 1000)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Clock and sleep behind one seam, so a test can drive the retry math
 * without waiting out the real backoff.
 */
export const timers = { now: () => Date.now(), sleep }

/** Number-or-undefined: absent or non-numeric headers must never become NaN. */
function numHeader(value) {
  if (value == null) return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the `EXACTCLI_BASE_URL` mock-endpoint override, a guarded escape
 * hatch for pointing exactcli at a local mock server. It ONLY accepts a
 * localhost origin. Anything else hard-fails (78) to reaffirm the host lock,
 * rather than silently trust an arbitrary host with your token. A mock server
 * has no business receiving a real Exact Online credential, so an explicit env
 * token (`EXACTCLI_ACCESS_TOKEN`, which may be a throwaway dummy) is required:
 * the keychain token is refused, not leaked.
 * @param {string} rawUrl
 * @returns {string} the localhost origin to use as the base
 */
function resolveMockOrigin(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ConfigError(`EXACTCLI_BASE_URL is not a valid URL: ${rawUrl}`)
  }
  if (url.protocol !== 'http:') {
    throw new ConfigError(
      `EXACTCLI_BASE_URL must be a plain http:// localhost URL. Refusing ` +
        `${rawUrl}. Only http://localhost, http://127.0.0.1 and http://[::1] ` +
        `are accepted.`,
    )
  }
  // URL.hostname wraps IPv6 in brackets, so ::1 arrives as "[::1]".
  const host = url.hostname
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  if (!isLocal) {
    throw new ConfigError(
      `EXACTCLI_BASE_URL is host-locked to localhost. Refusing ${url.origin}. ` +
        `Only localhost, 127.0.0.1 and ::1 are accepted, so a stray host can ` +
        `never receive your Exact Online token.`,
    )
  }
  if (!process.env.EXACTCLI_ACCESS_TOKEN) {
    throw new ConfigError(
      `EXACTCLI_BASE_URL points at a mock endpoint (${url.origin}) but no ` +
        `EXACTCLI_ACCESS_TOKEN is set. Refusing to send your stored keychain ` +
        `token to the override host. Set EXACTCLI_ACCESS_TOKEN=<dummy> to use ` +
        `the mock.`,
    )
  }
  process.stderr.write(
    `[exactcli] MOCK ENDPOINT: using ${url.origin} (host-lock bypassed)\n`,
  )
  return url.origin
}

/** @param {string} value @returns {string} the locked base origin */
function hostToBaseOrigin(value) {
  if (!HOST_RE.test(value)) {
    throw new CliError(`Host ${value} is not an Exact Online host`, {
      exitCode: 78,
    })
  }
  return `https://${value}`
}

/**
 * @param {object} options
 * @param {string} [options.host] Exact Online country host (allowlisted).
 * @param {string} options.token OAuth access token.
 * @param {() => Promise<string>} [options.onRefresh] Called once on a 401;
 *   returns a fresh access token to retry with.
 * @param {number} [options.timeout]
 * @param {boolean} [options.retry]
 * @param {string} [options.userAgent]
 */
export function createClient({
  host = 'start.exactonline.be',
  token: initialToken,
  onRefresh,
  timeout = 30_000,
  retry = true,
  userAgent = 'exactcli',
}) {
  const usingMock = Boolean(process.env.EXACTCLI_BASE_URL)
  const baseOrigin = usingMock
    ? resolveMockOrigin(process.env.EXACTCLI_BASE_URL)
    : hostToBaseOrigin(host)
  let token = initialToken
  if (usingMock) {
    // The override is host-locked to localhost, but the token guarantee must
    // hold at the CLIENT layer too: a command that skips auth still builds the
    // client with the real keychain credential. Force the env token and drop
    // the refresh callback, so a 401 from the mock cannot mint a real access
    // token and re-send it. resolveMockOrigin already proved the env token is
    // set.
    token = process.env.EXACTCLI_ACCESS_TOKEN
    onRefresh = undefined
  }

  /** Every URL, including a `__next` link, passes this origin lock. */
  function lockedUrl(path) {
    const url = new URL(path, baseOrigin)
    if (url.origin !== baseOrigin) {
      throw new CliError(
        `Refusing to send request outside ${baseOrigin}: ${url.origin}`,
        { exitCode: 78 },
      )
    }
    return url
  }

  /**
   * @param {string} method
   * @param {string} path Relative path or an absolute URL on the locked host.
   * @param {{ body?: object, query?: Record<string, unknown> }} [options]
   */
  async function request(method, path, { body, query } = {}) {
    const url = lockedUrl(path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v == null) continue
        url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v))
      }
    }
    if (url.href.length > MAX_URL_LENGTH) {
      throw new CliError(
        `Request URL exceeds ${MAX_URL_LENGTH} characters (Exact Online limit)`,
        { exitCode: 64 },
      )
    }
    return transport(method, url, {
      path,
      makeBody: body ? () => JSON.stringify(body) : undefined,
    })
  }

  function headers(hasBody) {
    const sent = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': userAgent,
    }
    if (hasBody) sent['content-type'] = 'application/json'
    return sent
  }

  /**
   * Spend the minutely budget politely: the previous response said no calls
   * are left in this minute, so wait for the window to reset instead of
   * burning an attempt on a certain 429.
   */
  async function waitForRateLimitWindow() {
    if (!retry) return
    const seen = api.lastRateLimit
    if (!seen || seen.minutelyRemaining !== 0) return
    const waitMs = Math.min(seen.reset - timers.now(), MAX_WAIT_MS)
    // A reset in the past, or NaN when the header was absent, means no wait.
    if (!(waitMs > 0)) return
    debug('minutely budget spent, waiting %dms for the window', waitMs)
    await timers.sleep(waitMs)
  }

  /**
   * Shared transport: every request goes through the same preemptive wait,
   * 429 backoff, 5xx and network retry, refresh-once and error mapping.
   * `makeBody` runs per attempt, so a retry never reuses a consumed body.
   * @param {string} method
   * @param {URL} url
   * @param {{ path: string, makeBody?: () => string }} options
   */
  async function transport(method, url, { path, makeBody }) {
    const maxAttempts = retry ? 3 : 1
    let attempts = 0
    let lastWaitSeconds
    let refreshed = false
    let waitedForRateLimit = false

    while (attempts < maxAttempts) {
      attempts++
      // A 429 sleep already covered this window and left the snapshot stale.
      // Waiting again on it would double the delay.
      if (!waitedForRateLimit) await waitForRateLimitWindow()
      waitedForRateLimit = false

      let res
      let text = ''
      try {
        res = await fetch(url, {
          method,
          headers: headers(Boolean(makeBody)),
          body: makeBody ? makeBody() : undefined,
          signal: AbortSignal.timeout(timeout),
          // Never auto-follow a redirect: fetch would re-send the bearer token
          // to the redirect target. We detect the 30x below and refuse.
          redirect: 'manual',
        })
        // Read the body in the same guarded step: a stall or a premature close
        // while the body streams is a reachability problem too. It also drains
        // the socket before any retry sleep.
        if (res.status !== 204) text = await res.text()
      } catch (cause) {
        // fetch and the body read reject on DNS failure, connection refused,
        // timeout and a broken stream. That is a reachability problem (69), not
        // an internal bug (70). Retry like a 5xx; on the last attempt surface
        // the cause.
        if (attempts < maxAttempts) {
          const delay = Math.min(1000 * 2 ** attempts, 30_000) + jitter()
          debug('fetch failed (%s), retrying in %dms', cause.name, delay)
          await timers.sleep(delay)
          continue
        }
        throw new ServiceUnavailableError(
          `Cannot reach ${baseOrigin}: ${cause.message}`,
          { cause },
        )
      }

      if (res.status >= 300 && res.status < 400) {
        throw new CliError(`Refusing to follow a redirect off ${baseOrigin}`, {
          exitCode: 78,
        })
      }

      debug('%s %s -> %d', method, path, res.status)

      // Snapshot the budget off EVERY response (429s included) so a command can
      // report the quota without a fresh request. Absent headers stay
      // undefined, never fabricated.
      api.lastRateLimit = {
        minutelyLimit: numHeader(res.headers.get('x-ratelimit-minutely-limit')),
        minutelyRemaining: numHeader(
          res.headers.get('x-ratelimit-minutely-remaining'),
        ),
        limit: numHeader(res.headers.get('x-ratelimit-limit')),
        remaining: numHeader(res.headers.get('x-ratelimit-remaining')),
        reset: numHeader(res.headers.get('x-ratelimit-reset')),
      }

      if (res.status === 429) {
        const now = timers.now()
        const { reset } = api.lastRateLimit
        const hasReset = Number.isFinite(reset)
        const resetAt = hasReset ? reset : now + DEFAULT_WAIT_MS
        // The daily budget resets hours from now: backoff would stall the CLI
        // until then. Fail fast with the reset time instead.
        if (res.headers.get('x-ratelimit-remaining') === '0') {
          const err = new RateLimitError(
            Math.max(1, Math.ceil((resetAt - now) / 1000)),
          )
          err.message = hasReset
            ? `Daily API limit reached. Resets at ${new Date(reset).toISOString()}`
            : 'Daily API limit reached. Reset time unknown'
          throw err
        }
        const waitMs = clamp(resetAt - now, MIN_WAIT_MS, MAX_WAIT_MS)
        lastWaitSeconds = Math.ceil(waitMs / 1000)
        // Nothing left to wait for on the last attempt (and none at all with
        // --no-retry): fall out of the loop and report the rate limit.
        if (attempts >= maxAttempts) break
        debug('rate limited, waiting %dms', waitMs)
        await timers.sleep(waitMs + jitter())
        waitedForRateLimit = true
        continue
      }

      // The access token lives 600 s. Refresh once and retry. Gate on a flag,
      // not on attempts === 1: a 429 backoff can consume the early attempts, so
      // the expiring-token 401 may arrive later. The refresh round is free
      // (attempts--), so it never eats the retry budget.
      if (res.status === 401 && onRefresh && !refreshed) {
        debug('401, refreshing the access token')
        refreshed = true
        token = await onRefresh()
        attempts--
        continue
      }

      if (res.status >= 500 && attempts < maxAttempts) {
        const delay = Math.min(1000 * 2 ** attempts, 30_000) + jitter()
        debug('server error %d, retrying in %dms', res.status, delay)
        await timers.sleep(delay)
        continue
      }

      if (res.status === 204) return null
      if (!res.ok) throw ApiError.fromResponse(res.status, text, path)
      if (!text) return null

      // $metadata answers XML, and some endpoints answer plain text. Only a
      // body that does not claim JSON passes through untouched.
      const contentType = res.headers.get('content-type')
      if (contentType != null && !contentType.includes('json')) return text
      try {
        return JSON.parse(text)
      } catch {
        // A broken JSON body must not turn into a silent empty result. The
        // body itself never reaches the message: it can carry data.
        throw new CliError(`Invalid JSON in response from ${path}`, {
          exitCode: 65,
        })
      }
    }

    // Only the 429 path leaves the loop: every other terminal status returns
    // or throws inside it. A host that keeps throttling us is rate limited
    // (75), not unavailable (69).
    throw new RateLimitError(lastWaitSeconds)
  }

  /**
   * Walk an OData collection through its `__next` links.
   * @param {string} path
   * @param {Record<string, unknown>} [query] Applied to the first page only;
   *   `__next` carries the query forward itself.
   * @param {{ maxPages?: number }} [options]
   * @returns {AsyncGenerator<object>}
   */
  async function* pageOData(path, query = {}, { maxPages = 100 } = {}) {
    let next = null
    let pages = 0
    api.lastNext = null

    while (pages < maxPages) {
      const body = next
        ? await request('GET', next)
        : await request('GET', path, { query })
      pages++
      const envelope = body?.d
      // Recorded before the rows go out: a consumer that stops early (a
      // --limit inside the page) still learns that more data exists, and the
      // value stays set when maxPages stops the walk.
      next = envelope?.__next ?? null
      api.lastNext = next
      yield* envelope?.results ?? []
      if (!next) break
    }
  }

  const api = {
    /** @param {string} path @param {{query?: object}} [opts] */
    get: (path, opts) => request('GET', path, opts),
    /** @param {string} path @param {object} body @param {{query?: object}} [opts] */
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    /** @param {string} path @param {object} body @param {{query?: object}} [opts] */
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    /** @param {string} path @param {{query?: object}} [opts] */
    del: (path, opts) => request('DELETE', path, opts),
    pageOData,
    /**
     * Rate-limit budget from the most recent response, undefined until the
     * first one. Written by transport().
     * @type {{ minutelyLimit?: number, minutelyRemaining?: number,
     *   limit?: number, remaining?: number, reset?: number } | undefined}
     */
    lastRateLimit: undefined,
    /**
     * The `__next` link of the last page read, or null when the collection is
     * exhausted. Written by pageOData().
     * @type {string | null}
     */
    lastNext: null,
  }
  return api
}
