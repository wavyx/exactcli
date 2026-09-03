import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import createDebug from 'debug'
import { createClient, timers } from '../../src/lib/client.js'
import {
  ApiError,
  CliError,
  RateLimitError,
  ServiceUnavailableError,
} from '../../src/lib/errors.js'
import { apiBase, mockApi } from '../helpers.js'

const BASE = apiBase()
const NOW = 1_700_000_000_000
const ME = '/api/v1/current/Me'

/** Every sleep the client asked for, in order, in milliseconds. */
let slept
/** Fake wall clock. Every fake sleep moves it, like a real one would. */
let clock

/** A response object with only the parts transport() reads. */
function stubResponse({ status = 200, body = '', headers = {}, brokenBody }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: () =>
      brokenBody
        ? Promise.reject(
            new DOMException('The operation was aborted', 'TimeoutError'),
          )
        : Promise.resolve(body),
  }
}

function client(options = {}) {
  return createClient({ token: 'test-token', retry: true, ...options })
}

/** Headers of a response that leaves the minutely budget alone. */
function limits(extra = {}) {
  return {
    'x-ratelimit-minutely-limit': '60',
    'x-ratelimit-minutely-remaining': '59',
    ...extra,
  }
}

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
  slept = []
  clock = NOW
  vi.spyOn(timers, 'sleep').mockImplementation(async (ms) => {
    slept.push(ms)
    clock += ms
  })
  vi.spyOn(timers, 'now').mockImplementation(() => clock)
  // Jitter is random by design; pin it so the sleep assertions are exact.
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
})

describe('429 handling', () => {
  it('waits until the reset time, then succeeds', async () => {
    const scope = mockApi()
      .get(ME)
      .reply(429, '', limits({ 'x-ratelimit-reset': String(NOW + 5000) }))
      .get(ME)
      .reply(200, { d: { results: [] } }, limits())

    const result = await client().get(ME)
    expect(result).toEqual({ d: { results: [] } })
    expect(slept).toEqual([5000])
    expect(scope.isDone()).toBe(true)
  })

  it('clamps the wait to 65 seconds', async () => {
    mockApi()
      .get(ME)
      .reply(429, '', limits({ 'x-ratelimit-reset': String(NOW + 600_000) }))
      .get(ME)
      .reply(200, { d: {} }, limits())

    await client().get(ME)
    expect(slept).toEqual([65_000])
  })

  it('clamps the wait to one second when the reset is in the past', async () => {
    mockApi()
      .get(ME)
      .reply(429, '', limits({ 'x-ratelimit-reset': String(NOW - 5000) }))
      .get(ME)
      .reply(200, { d: {} }, limits())

    await client().get(ME)
    expect(slept).toEqual([1000])
  })

  it('waits two seconds when the reset header is absent', async () => {
    mockApi()
      .get(ME)
      .reply(429, '', limits())
      .get(ME)
      .reply(200, { d: {} }, limits())

    await client().get(ME)
    expect(slept).toEqual([2000])
  })

  it('throws RateLimitError (75) when the retries exhaust', async () => {
    const scope = mockApi()
      .get(ME)
      .times(3)
      .reply(429, '', limits({ 'x-ratelimit-reset': String(NOW + 5000) }))

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.exitCode).toBe(75)
    // The clock moved through the first wait, so the repeated reset instant
    // is already past on the second one: it clamps to the one second floor.
    expect(err.retryAfter).toBe(1)
    expect(slept).toEqual([5000, 1000])
    expect(scope.isDone()).toBe(true)
  })

  it('throws at once when retry is off', async () => {
    let calls = 0
    mockApi()
      .get(ME)
      .times(3)
      .reply(
        429,
        () => {
          calls++
          return ''
        },
        limits({ 'x-ratelimit-reset': String(NOW + 12_000) }),
      )

    const err = await client({ retry: false })
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.exitCode).toBe(75)
    expect(err.retryAfter).toBe(12)
    expect(calls).toBe(1)
    expect(slept).toEqual([])
  })

  it('fails fast when the daily budget is exhausted', async () => {
    const reset = NOW + 3_600_000
    let calls = 0
    mockApi()
      .get(ME)
      .times(3)
      .reply(
        429,
        () => {
          calls++
          return ''
        },
        limits({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        }),
      )

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.exitCode).toBe(75)
    expect(err.retryAfter).toBe(3600)
    expect(err.message).toBe(
      `Daily API limit reached. Resets at ${new Date(reset).toISOString()}`,
    )
    expect(calls).toBe(1)
    expect(slept).toEqual([])
  })

  it('reports at least one second when the daily reset already passed', async () => {
    const reset = NOW - 5000
    mockApi()
      .get(ME)
      .reply(
        429,
        '',
        limits({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        }),
      )

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err.retryAfter).toBe(1)
    expect(err.message).toBe(
      `Daily API limit reached. Resets at ${new Date(reset).toISOString()}`,
    )
  })

  it('says the reset time is unknown when the header is absent', async () => {
    mockApi()
      .get(ME)
      .reply(429, '', limits({ 'x-ratelimit-remaining': '0' }))

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err.retryAfter).toBe(2)
    expect(err.message).toBe('Daily API limit reached. Reset time unknown')
  })

  it('fails fast on a daily 429 that also drained the minute', async () => {
    // The daily branch must throw before any wait: neither the 429 backoff nor
    // the preemptive window wait may delay the report.
    mockApi()
      .get(ME)
      .reply(429, '', {
        'x-ratelimit-minutely-limit': '60',
        'x-ratelimit-minutely-remaining': '0',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(NOW + 3_600_000),
      })

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.exitCode).toBe(75)
    expect(slept).toEqual([])
  })

  it('does not add a preemptive wait after a 429 sleep', async () => {
    // A minutely 429 whose reset is the far daily instant: the 429 sleep and
    // the preemptive wait target the same window and must not compound.
    const scope = mockApi()
      .get(ME)
      .reply(429, '', {
        'x-ratelimit-minutely-limit': '60',
        'x-ratelimit-minutely-remaining': '0',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(NOW + 3_600_000),
      })
      .get(ME)
      .reply(200, { d: { results: [] } }, limits())

    await client().get(ME)
    expect(slept).toEqual([65_000])
    expect(scope.isDone()).toBe(true)
  })
})

describe('preemptive minutely wait', () => {
  it('waits for the reset before the next request', async () => {
    const scope = mockApi()
      .get(ME)
      .reply(
        200,
        { d: {} },
        {
          'x-ratelimit-minutely-limit': '60',
          'x-ratelimit-minutely-remaining': '0',
          'x-ratelimit-reset': String(NOW + 4000),
        },
      )
      .get('/api/v1/123456/crm/Accounts')
      .reply(200, { d: { results: [] } }, limits())

    const api = client()
    await api.get(ME)
    expect(slept).toEqual([])

    await api.get('/api/v1/123456/crm/Accounts')
    expect(slept).toEqual([4000])
    expect(scope.isDone()).toBe(true)
  })

  it('caps the preemptive wait at 65 seconds', async () => {
    mockApi()
      .get(ME)
      .reply(
        200,
        { d: {} },
        {
          'x-ratelimit-minutely-remaining': '0',
          'x-ratelimit-reset': String(NOW + 600_000),
        },
      )
      .get(ME)
      .reply(200, { d: {} }, limits())

    const api = client()
    await api.get(ME)
    await api.get(ME)
    expect(slept).toEqual([65_000])
  })

  it('does not wait when the reset already passed', async () => {
    mockApi()
      .get(ME)
      .reply(
        200,
        { d: {} },
        {
          'x-ratelimit-minutely-remaining': '0',
          'x-ratelimit-reset': String(NOW - 1000),
        },
      )
      .get(ME)
      .reply(200, { d: {} }, limits())

    const api = client()
    await api.get(ME)
    await api.get(ME)
    expect(slept).toEqual([])
  })

  it('does not wait when the reset header is absent', async () => {
    mockApi()
      .get(ME)
      .reply(200, { d: {} }, { 'x-ratelimit-minutely-remaining': '0' })
      .get(ME)
      .reply(200, { d: {} }, limits())

    const api = client()
    await api.get(ME)
    await api.get(ME)
    expect(slept).toEqual([])
  })

  it('does not wait when the budget is not exhausted', async () => {
    mockApi().get(ME).twice().reply(200, { d: {} }, limits())

    const api = client()
    await api.get(ME)
    await api.get(ME)
    expect(slept).toEqual([])
  })

  it('does not wait when retry is off', async () => {
    mockApi()
      .get(ME)
      .twice()
      .reply(
        200,
        { d: {} },
        {
          'x-ratelimit-minutely-remaining': '0',
          'x-ratelimit-reset': String(NOW + 4000),
        },
      )

    const api = client({ retry: false })
    await api.get(ME)
    await api.get(ME)
    expect(slept).toEqual([])
  })
})

describe('rate-limit snapshot', () => {
  it('captures the five headers off every response', async () => {
    mockApi()
      .get(ME)
      .reply(
        200,
        { d: {} },
        {
          'x-ratelimit-minutely-limit': '60',
          'x-ratelimit-minutely-remaining': '57',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4321',
          'x-ratelimit-reset': String(NOW + 30_000),
        },
      )

    const api = client()
    expect(api.lastRateLimit).toBeUndefined()
    await api.get(ME)
    expect(api.lastRateLimit).toEqual({
      minutelyLimit: 60,
      minutelyRemaining: 57,
      minutelyReset: undefined,
      limit: 5000,
      remaining: 4321,
      reset: NOW + 30_000,
    })
  })

  it('leaves absent or non-numeric headers undefined, never NaN', async () => {
    mockApi().get(ME).reply(200, { d: {} }, { 'x-ratelimit-reset': 'soon' })

    const api = client()
    await api.get(ME)
    expect(api.lastRateLimit).toEqual({
      minutelyLimit: undefined,
      minutelyRemaining: undefined,
      minutelyReset: undefined,
      limit: undefined,
      remaining: undefined,
      reset: undefined,
    })
  })

  it('records the minutely reset header', async () => {
    mockApi()
      .get(ME)
      .reply(200, { d: {} }, { 'x-ratelimit-minutely-reset': '1788442200000' })

    const api = client()
    await api.get(ME)
    expect(api.lastRateLimit.minutelyReset).toBe(1788442200000)
  })
})

describe('401 refresh', () => {
  it('refreshes once and retries with the new token', async () => {
    const onRefresh = vi.fn().mockResolvedValue('fresh-token')
    const scope = mockApi()
      .get(ME)
      .matchHeader('authorization', 'Bearer test-token')
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-token')
      .reply(200, { d: { results: [{ CurrentDivision: 123456 }] } }, limits())

    const result = await client({ onRefresh }).get(ME)
    expect(result.d.results[0].CurrentDivision).toBe(123456)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(scope.isDone()).toBe(true)
  })

  it('refreshes once even when retry is off', async () => {
    const onRefresh = vi.fn().mockResolvedValue('fresh-token')
    const scope = mockApi()
      .get(ME)
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-token')
      .reply(200, { d: {} }, limits())

    await client({ onRefresh, retry: false }).get(ME)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(scope.isDone()).toBe(true)
  })

  it('gives up after a second 401 with ApiError (77)', async () => {
    const onRefresh = vi.fn().mockResolvedValue('still-bad')
    mockApi()
      .get(ME)
      .times(2)
      .reply(401, { error: { message: { value: 'expired' } } })

    const err = await client({ onRefresh })
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(401)
    expect(err.exitCode).toBe(77)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('throws ApiError (77) without onRefresh and does not retry', async () => {
    let calls = 0
    mockApi()
      .get(ME)
      .times(3)
      .reply(401, () => {
        calls++
        return { error: { message: { value: 'invalid token' } } }
      })

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.exitCode).toBe(77)
    expect(calls).toBe(1)
  })

  it('refreshes on a 401 that lands after a 429 backoff', async () => {
    const onRefresh = vi.fn().mockResolvedValue('fresh-token')
    const scope = mockApi()
      .get(ME)
      .reply(429, '', limits({ 'x-ratelimit-reset': String(NOW + 1000) }))
      .get(ME)
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-token')
      .reply(200, { d: {} }, limits())

    await client({ onRefresh }).get(ME)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(scope.isDone()).toBe(true)
  })
})

describe('other 4xx', () => {
  it('never retries a 400', async () => {
    let calls = 0
    mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .times(3)
      .reply(400, () => {
        calls++
        return { error: { message: { value: 'Invalid $filter' } } }
      })

    const err = await client()
      .get('/api/v1/123456/crm/Accounts')
      .catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(400)
    expect(err.exitCode).toBe(65)
    expect(err.message).toContain('Invalid $filter')
    expect(calls).toBe(1)
    expect(slept).toEqual([])
  })

  it('never retries a 403', async () => {
    let calls = 0
    mockApi()
      .get(ME)
      .times(3)
      .reply(403, () => {
        calls++
        return { error: { message: { value: 'Forbidden' } } }
      })

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err.exitCode).toBe(77)
    expect(calls).toBe(1)
  })
})

describe('5xx and network failures', () => {
  it('retries a 500 with backoff, then succeeds', async () => {
    const scope = mockApi()
      .get(ME)
      .reply(500, { error: { message: { value: 'boom' } } })
      .get(ME)
      .reply(200, { d: { results: [] } }, limits())

    const result = await client().get(ME)
    expect(result).toEqual({ d: { results: [] } })
    expect(slept).toEqual([2000])
    expect(scope.isDone()).toBe(true)
  })

  it('throws ApiError (69) when the 5xx retries exhaust', async () => {
    const scope = mockApi()
      .get(ME)
      .times(3)
      .reply(503, { error: { message: { value: 'Service Unavailable' } } })

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(503)
    expect(err.exitCode).toBe(69)
    expect(slept).toEqual([2000, 4000])
    expect(scope.isDone()).toBe(true)
  })

  it('retries a transient connection failure, then succeeds', async () => {
    const scope = mockApi()
      .get(ME)
      .replyWithError(
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      )
      .get(ME)
      .reply(200, { d: {} }, limits())

    await client().get(ME)
    expect(slept).toEqual([2000])
    expect(scope.isDone()).toBe(true)
  })

  it('throws ServiceUnavailableError (69) when the network keeps failing', async () => {
    const scope = mockApi()
      .get(ME)
      .times(3)
      .replyWithError(
        Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        }),
      )

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ServiceUnavailableError)
    expect(err.exitCode).toBe(69)
    expect(err.message).toContain(`Cannot reach ${BASE}`)
    expect(err.cause).toBeInstanceOf(Error)
    expect(slept).toEqual([2000, 4000])
    expect(scope.isDone()).toBe(true)
  })

  it('retries when the body read fails, then succeeds', async () => {
    // A body that stalls or closes early rejects on res.text(), not on fetch.
    // nock cannot produce that, so drive the transport with a stub response.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(stubResponse({ brokenBody: true }))
      .mockResolvedValueOnce(
        stubResponse({
          body: '{"d":{"results":[]}}',
          headers: { 'content-type': 'application/json' },
        }),
      )

    const result = await client().get(ME)
    expect(result).toEqual({ d: { results: [] } })
    expect(slept).toEqual([2000])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws 69 when the body read keeps failing', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(stubResponse({ brokenBody: true }))

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(ServiceUnavailableError)
    expect(err.exitCode).toBe(69)
    expect(err.message).toContain(`Cannot reach ${BASE}`)
    expect(slept).toEqual([2000, 4000])
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('does not retry a network failure when retry is off', async () => {
    const refused = () =>
      Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      })
    mockApi()
      .get(ME)
      .replyWithError(refused())
      .get(ME)
      .replyWithError(refused())

    const err = await client({ retry: false })
      .get(ME)
      .catch((e) => e)
    expect(err.exitCode).toBe(69)
    // The second interceptor is untouched: only one request went out.
    expect(nock.pendingMocks()).toHaveLength(1)
    expect(slept).toEqual([])
  })
})

describe('retried writes and secrecy', () => {
  const ACCOUNTS = '/api/v1/123456/crm/Accounts'

  it('re-serialises the body on every attempt', async () => {
    const bodies = []
    const record = (body) => {
      bodies.push(body)
      return true
    }
    const scope = mockApi()
      .post(ACCOUNTS, record)
      .reply(500, { error: { message: { value: 'boom' } } })
      .post(ACCOUNTS, record)
      .reply(201, { d: { ID: 'g1' } }, limits())

    const result = await client().post(ACCOUNTS, { Name: 'Acme' })
    expect(result).toEqual({ d: { ID: 'g1' } })
    expect(bodies).toEqual([{ Name: 'Acme' }, { Name: 'Acme' }])
    expect(scope.isDone()).toBe(true)
  })

  it('never writes the token into an error or the debug log', async () => {
    const written = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    createDebug.enable('exact:client')
    try {
      mockApi()
        .get(ME)
        .reply(400, { error: { message: { value: 'Invalid $filter' } } })
      const apiErr = await client()
        .get(ME)
        .catch((e) => e)

      mockApi()
        .get(ME)
        .times(3)
        .replyWithError(new Error('connect ECONNREFUSED'))
      const netErr = await client()
        .get(ME)
        .catch((e) => e)

      const log = written.join('')
      // Proves the debug stream was really captured, so the check below bites.
      expect(log).toContain('GET /api/v1/current/Me -> 400')
      const haystack = [
        apiErr.message,
        netErr.message,
        String(netErr.cause?.message),
        log,
      ].join('\n')
      expect(haystack).not.toContain('test-token')
    } finally {
      createDebug.disable()
    }
  })

  it('reports a broken JSON body without echoing it', async () => {
    mockApi().get(ME).reply(200, '{"d":{"results":[{"Secret"', {
      'content-type': 'application/json',
    })

    const err = await client()
      .get(ME)
      .catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(65)
    expect(err.message).toBe(`Invalid JSON in response from ${ME}`)
    expect(slept).toEqual([])
  })
})
