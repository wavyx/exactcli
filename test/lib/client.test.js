import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import {
  DEFAULT_HOST,
  createClient,
  HOST_RE,
  timers,
} from '../../src/lib/client.js'
import { ApiError, CliError } from '../../src/lib/errors.js'
import { apiBase, mockApi } from '../helpers.js'

const BASE = apiBase()

/** A client that never retries, so one interceptor equals one request. */
function client(options = {}) {
  return createClient({
    token: 'test-token',
    retry: false,
    timeout: 5000,
    ...options,
  })
}

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
})

describe('host allowlist', () => {
  it('matches the seven Exact Online country hosts', () => {
    for (const tld of ['be', 'nl', 'de', 'co.uk', 'com', 'es', 'fr']) {
      expect(HOST_RE.test(`start.exactonline.${tld}`)).toBe(true)
    }
  })

  it('shares one default host with the commands', () => {
    expect(DEFAULT_HOST).toBe('start.exactonline.be')
    expect(HOST_RE.test(DEFAULT_HOST)).toBe(true)
  })

  it('defaults to start.exactonline.be', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .reply(200, { d: { results: [] } })

    await client().get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('locks onto another country host when asked', async () => {
    const scope = nock('https://start.exactonline.nl')
      .get('/api/v1/current/Me')
      .reply(200, { d: { results: [] } })

    await client({ host: 'start.exactonline.nl' }).get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('refuses a host outside the allowlist with exit 78', () => {
    try {
      client({ host: 'evil.example.com' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
      expect(err.exitCode).toBe(78)
      expect(err.message).toBe(
        'Host evil.example.com is not an Exact Online host',
      )
    }
  })

  it('refuses a lookalike host that only starts with an Exact host', () => {
    expect(() => client({ host: 'start.exactonline.be.evil.com' })).toThrow(
      /is not an Exact Online host/,
    )
  })
})

describe('defaults', () => {
  it('needs nothing but a token', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .matchHeader('user-agent', 'exactcli')
      .reply(200, { d: { results: [] } })

    await createClient({ token: 'test-token' }).get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('exposes a real clock and a real sleep', async () => {
    const before = timers.now()
    await timers.sleep(1)
    expect(timers.now()).toBeGreaterThanOrEqual(before)
  })
})

describe('origin lock', () => {
  it('refuses an absolute off-host URL as the path', async () => {
    const err = await client()
      .get('https://evil.example.com/steal')
      .catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe(
      `Refusing to send request outside ${BASE}: https://evil.example.com`,
    )
  })

  it('refuses a protocol-relative path that resolves off-host', async () => {
    const err = await client()
      .get('//evil.example.com/steal')
      .catch((e) => e)
    expect(err.exitCode).toBe(78)
  })

  it('refuses another Exact country host than the locked one', async () => {
    const err = await client()
      .get('https://start.exactonline.nl/api/v1/current/Me')
      .catch((e) => e)
    expect(err.exitCode).toBe(78)
    expect(err.message).toContain('https://start.exactonline.nl')
  })

  it('accepts an absolute URL on the locked host', async () => {
    const scope = mockApi().get('/api/v1/current/Me').reply(200, { d: {} })

    await client().get(`${BASE}/api/v1/current/Me`)
    expect(scope.isDone()).toBe(true)
  })
})

describe('query building', () => {
  it('sends string and number values', async () => {
    const scope = mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .query({ $select: 'Name', $top: '10' })
      .reply(200, { d: { results: [] } })

    await client().get('/api/v1/123456/crm/Accounts', {
      query: { $select: 'Name', $top: 10 },
    })
    expect(scope.isDone()).toBe(true)
  })

  it('skips null and undefined values', async () => {
    const scope = mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .query((q) => !('$filter' in q) && !('$expand' in q) && q.$top === '5')
      .reply(200, { d: { results: [] } })

    await client().get('/api/v1/123456/crm/Accounts', {
      query: { $filter: null, $expand: undefined, $top: 5 },
    })
    expect(scope.isDone()).toBe(true)
  })

  it('joins array values with commas', async () => {
    const scope = mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .query({ $select: 'ID,Name' })
      .reply(200, { d: { results: [] } })

    await client().get('/api/v1/123456/crm/Accounts', {
      query: { $select: ['ID', 'Name'] },
    })
    expect(scope.isDone()).toBe(true)
  })

  it('sends no query string when no query is given', async () => {
    const scope = mockApi().get('/api/v1/current/Me').reply(200, { d: {} })

    await client().get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })
})

describe('URL length guard', () => {
  it('refuses a URL longer than 6000 characters with exit 64', async () => {
    let calls = 0
    mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .query(() => {
        calls++
        return true
      })
      .reply(200, {})

    const err = await client()
      .get('/api/v1/123456/crm/Accounts', {
        query: { $filter: 'x'.repeat(6000) },
      })
      .catch((e) => e)

    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(64)
    expect(err.message).toBe(
      'Request URL exceeds 6000 characters (Exact Online limit)',
    )
    expect(calls).toBe(0)
  })

  it('allows a URL below the limit', async () => {
    const scope = mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .query(true)
      .reply(200, { d: { results: [] } })

    await client().get('/api/v1/123456/crm/Accounts', {
      query: { $filter: 'x'.repeat(100) },
    })
    expect(scope.isDone()).toBe(true)
  })
})

describe('headers', () => {
  it('sends bearer auth, accept and user-agent on every request', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .matchHeader('authorization', 'Bearer test-token')
      .matchHeader('accept', 'application/json')
      .matchHeader('user-agent', 'exactcli')
      .reply(200, { d: {} })

    await client().get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('sends the configured user agent', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .matchHeader('user-agent', 'exactcli/9.9.9')
      .reply(200, { d: {} })

    await client({ userAgent: 'exactcli/9.9.9' }).get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('omits content-type when no body is sent', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .matchHeader('content-type', (v) => v === undefined)
      .reply(200, { d: {} })

    await client().get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('sends content-type json with a body', async () => {
    const scope = mockApi()
      .post('/api/v1/123456/crm/Accounts', { Name: 'Acme' })
      .matchHeader('content-type', 'application/json')
      .reply(201, { d: { ID: 'guid-1' } })

    const result = await client().post('/api/v1/123456/crm/Accounts', {
      Name: 'Acme',
    })
    expect(result).toEqual({ d: { ID: 'guid-1' } })
    expect(scope.isDone()).toBe(true)
  })
})

describe('write verbs', () => {
  it('PUT sends a JSON body and returns null on 204', async () => {
    const scope = mockApi()
      .put("/api/v1/123456/crm/Accounts(guid'g1')", { Name: 'Acme BV' })
      .reply(204)

    const result = await client().put("/api/v1/123456/crm/Accounts(guid'g1')", {
      Name: 'Acme BV',
    })
    expect(result).toBeNull()
    expect(scope.isDone()).toBe(true)
  })

  it('DELETE returns null on 204', async () => {
    const scope = mockApi()
      .delete("/api/v1/123456/crm/Accounts(guid'g1')")
      .reply(204)

    const result = await client().del("/api/v1/123456/crm/Accounts(guid'g1')")
    expect(result).toBeNull()
    expect(scope.isDone()).toBe(true)
  })

  it('passes a query alongside a body', async () => {
    const scope = mockApi()
      .post('/api/v1/123456/salesinvoice/SalesInvoices', { Journal: '70' })
      .query({ $select: 'InvoiceID' })
      .reply(201, { d: { InvoiceID: 'guid-2' } })

    await client().post(
      '/api/v1/123456/salesinvoice/SalesInvoices',
      { Journal: '70' },
      { query: { $select: 'InvoiceID' } },
    )
    expect(scope.isDone()).toBe(true)
  })

  it('sends a query on DELETE', async () => {
    const scope = mockApi()
      .delete('/api/v1/123456/crm/Accounts')
      .query({ ID: 'g1' })
      .reply(204)

    await client().del('/api/v1/123456/crm/Accounts', { query: { ID: 'g1' } })
    expect(scope.isDone()).toBe(true)
  })
})

describe('response bodies', () => {
  it('parses the OData collection envelope', async () => {
    const body = { d: { results: [{ ID: 'g1', Name: 'Acme' }] } }
    mockApi().get('/api/v1/123456/crm/Accounts').reply(200, body)

    expect(await client().get('/api/v1/123456/crm/Accounts')).toEqual(body)
  })

  it('returns null on 204', async () => {
    mockApi().get('/api/v1/current/Me').reply(204)

    expect(await client().get('/api/v1/current/Me')).toBeNull()
  })

  it('returns non-JSON text unchanged (XML $metadata)', async () => {
    const xml = '<?xml version="1.0"?><edmx:Edmx Version="1.0"/>'
    mockApi()
      .get('/api/v1/123456/crm/$metadata')
      .reply(200, xml, { 'content-type': 'application/xml' })

    expect(await client().get('/api/v1/123456/crm/$metadata')).toBe(xml)
  })

  it('returns null for an empty body', async () => {
    mockApi().get('/api/v1/current/Me').reply(200, '')

    expect(await client().get('/api/v1/current/Me')).toBeNull()
  })

  it('parses a JSON body that carries no content-type', async () => {
    mockApi().get('/api/v1/current/Me').reply(200, '{"d":{"results":[]}}')

    expect(await client().get('/api/v1/current/Me')).toEqual({
      d: { results: [] },
    })
  })

  it('refuses a broken body that claims JSON with exit 65', async () => {
    mockApi()
      .get('/api/v1/123456/crm/Accounts')
      .reply(200, '{"d":{"results":[{"ID"', {
        'content-type': 'application/json; charset=utf-8',
      })

    const err = await client()
      .get('/api/v1/123456/crm/Accounts')
      .catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(65)
    expect(err.message).toBe(
      'Invalid JSON in response from /api/v1/123456/crm/Accounts',
    )
    // The body can carry data: it never reaches the message.
    expect(err.message).not.toContain('ID')
  })

  it('refuses to follow a redirect off the locked host', async () => {
    const scope = mockApi()
      .get('/api/v1/current/Me')
      .reply(302, '', { location: 'https://evil.example.com/steal' })

    const err = await client()
      .get('/api/v1/current/Me')
      .catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe(`Refusing to follow a redirect off ${BASE}`)
    expect(scope.isDone()).toBe(true)
  })

  it('maps a 404 to ApiError without retrying', async () => {
    mockApi()
      .get("/api/v1/123456/crm/Accounts(guid'nope')")
      .reply(404, { error: { code: '', message: { value: 'Not found' } } })

    const err = await client()
      .get("/api/v1/123456/crm/Accounts(guid'nope')")
      .catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.statusCode).toBe(404)
    expect(err.message).toContain('Not found')
  })
})

describe('mock endpoint override (EXACTCLI_BASE_URL)', () => {
  afterEach(() => {
    delete process.env.EXACTCLI_BASE_URL
    delete process.env.EXACTCLI_ACCESS_TOKEN
  })

  it('targets the localhost origin and announces the bypass', async () => {
    process.env.EXACTCLI_BASE_URL = 'http://127.0.0.1:4010'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const mockClient = client({ token: 'keychain-secret' })
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('MOCK ENDPOINT'),
    )
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('http://127.0.0.1:4010'),
    )

    const scope = nock('http://127.0.0.1:4010')
      .get('/api/v1/current/Me')
      .matchHeader('authorization', 'Bearer dummy')
      .reply(200, { d: { results: [] } })

    await mockClient.get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })

  it('accepts localhost and ::1', async () => {
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    for (const base of ['http://localhost:4010', 'http://[::1]:4010']) {
      process.env.EXACTCLI_BASE_URL = base
      const scope = nock(base).get('/api/v1/current/Me').reply(200, { d: {} })
      await client({ token: 'x' }).get('/api/v1/current/Me')
      expect(scope.isDone()).toBe(true)
    }
  })

  it('never calls onRefresh against the mock host', async () => {
    process.env.EXACTCLI_BASE_URL = 'http://127.0.0.1:4010'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const onRefresh = vi.fn().mockResolvedValue('minted-real-token')

    const mockClient = client({ token: 'keychain-secret', onRefresh })
    nock('http://127.0.0.1:4010')
      .get('/api/v1/current/Me')
      .reply(401, { error: { message: { value: 'nope' } } })

    await expect(mockClient.get('/api/v1/current/Me')).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('refuses an https override on localhost with exit 78', () => {
    process.env.EXACTCLI_BASE_URL = 'https://localhost:4010'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'

    try {
      client()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(/plain http:\/\/ localhost URL/)
    }
  })

  it('refuses an exotic scheme with exit 78', () => {
    process.env.EXACTCLI_BASE_URL = 'foo://localhost:4010'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'

    try {
      client()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(/plain http:\/\/ localhost URL/)
    }
  })

  it('refuses a non-local override with exit 78', () => {
    process.env.EXACTCLI_BASE_URL = 'http://evil.example.com'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'

    try {
      client()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(/host-locked to localhost/)
    }
  })

  it('refuses an override without EXACTCLI_ACCESS_TOKEN', () => {
    process.env.EXACTCLI_BASE_URL = 'http://localhost:4010'
    delete process.env.EXACTCLI_ACCESS_TOKEN

    try {
      client({ token: 'keychain-secret' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(/EXACTCLI_ACCESS_TOKEN/)
    }
  })

  it('refuses a malformed override URL with exit 78', () => {
    process.env.EXACTCLI_BASE_URL = 'not a url'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'

    try {
      client()
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(/not a valid URL/)
    }
  })

  it('skips the host allowlist under the override', async () => {
    process.env.EXACTCLI_BASE_URL = 'http://127.0.0.1:4010'
    process.env.EXACTCLI_ACCESS_TOKEN = 'dummy'
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const scope = nock('http://127.0.0.1:4010')
      .get('/api/v1/current/Me')
      .reply(200, { d: {} })

    await client({ host: 'evil.example.com' }).get('/api/v1/current/Me')
    expect(scope.isDone()).toBe(true)
  })
})

describe('download', () => {
  const client = () => createClient({ token: 'test-token', retry: false })

  it('fetches bytes from the locked host with the bearer token', async () => {
    const scope = mockApi()
      .get('/docs/SysAttachment.aspx')
      .query({ ID: 'a', Download: '1' })
      .matchHeader('authorization', 'Bearer test-token')
      .reply(200, Buffer.from([1, 2, 3]), { 'content-type': 'image/png' })

    const { bytes, contentType } = await client().download(
      'https://start.exactonline.be/docs/SysAttachment.aspx?ID=a&Download=1',
    )

    expect(scope.isDone()).toBe(true)
    expect([...bytes]).toEqual([1, 2, 3])
    expect(contentType).toBe('image/png')
  })

  it('refuses an off-host URL, a redirect, and maps an error status', async () => {
    await expect(
      client().download('https://evil.example/x'),
    ).rejects.toMatchObject({ exitCode: 78 })
    mockApi()
      .get('/docs/x')
      .reply(302, '', { location: 'https://evil.example/' })
    await expect(
      client().download('https://start.exactonline.be/docs/x'),
    ).rejects.toMatchObject({ exitCode: 78 })
    mockApi().get('/docs/y').reply(404, 'gone')
    await expect(
      client().download('https://start.exactonline.be/docs/y'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reports a network failure with exit 69', async () => {
    mockApi().get('/docs/z').replyWithError('socket hang up')
    await expect(
      client().download('https://start.exactonline.be/docs/z'),
    ).rejects.toMatchObject({ exitCode: 69 })
  })
})
