import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import nock from 'nock'
import { createClient } from '../../src/lib/client.js'
import { CliError } from '../../src/lib/errors.js'
import { apiBase, mockApi } from '../helpers.js'

const BASE = apiBase()
const ACCOUNTS = '/api/v1/123456/crm/Accounts'

function client(options = {}) {
  return createClient({ token: 'test-token', retry: false, ...options })
}

async function collect(iterator) {
  const items = []
  for await (const item of iterator) items.push(item)
  return items
}

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

describe('pageOData', () => {
  it('follows __next across pages and yields every row', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({ $top: '2' })
      .reply(200, {
        d: {
          results: [{ ID: 'g1' }, { ID: 'g2' }],
          __next: `${BASE}${ACCOUNTS}?$skiptoken=guid'g2'`,
        },
      })
      .get(ACCOUNTS)
      .query({ $skiptoken: "guid'g2'" })
      .reply(200, { d: { results: [{ ID: 'g3' }] } })

    const api = client()
    const items = await collect(api.pageOData(ACCOUNTS, { $top: 2 }))

    expect(items).toEqual([{ ID: 'g1' }, { ID: 'g2' }, { ID: 'g3' }])
    expect(api.lastNext).toBeNull()
    expect(scope.isDone()).toBe(true)
  })

  it('stops on a single page and clears lastNext', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .reply(200, { d: { results: [{ ID: 'g1' }] } })

    const api = client()
    expect(api.lastNext).toBeNull()
    const items = await collect(api.pageOData(ACCOUNTS))

    expect(items).toEqual([{ ID: 'g1' }])
    expect(api.lastNext).toBeNull()
    expect(scope.isDone()).toBe(true)
  })

  it('stops at maxPages and leaves lastNext set', async () => {
    const next1 = `${BASE}${ACCOUNTS}?$skiptoken=p2`
    const next2 = `${BASE}${ACCOUNTS}?$skiptoken=p3`
    const scope = mockApi()
      .get(ACCOUNTS)
      .reply(200, { d: { results: [{ ID: 'g1' }], __next: next1 } })
      .get(ACCOUNTS)
      .query({ $skiptoken: 'p2' })
      .reply(200, { d: { results: [{ ID: 'g2' }], __next: next2 } })

    const api = client()
    const items = await collect(api.pageOData(ACCOUNTS, {}, { maxPages: 2 }))

    expect(items).toEqual([{ ID: 'g1' }, { ID: 'g2' }])
    expect(api.lastNext).toBe(next2)
    expect(scope.isDone()).toBe(true)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('tolerates a following page without results', async () => {
    const next = `${BASE}${ACCOUNTS}?$skiptoken=p2`
    const scope = mockApi()
      .get(ACCOUNTS)
      .reply(200, { d: { results: [{ ID: 'g1' }], __next: next } })
      .get(ACCOUNTS)
      .query({ $skiptoken: 'p2' })
      .reply(200, { d: {} })

    const api = client()
    expect(await collect(api.pageOData(ACCOUNTS))).toEqual([{ ID: 'g1' }])
    expect(api.lastNext).toBeNull()
    expect(scope.isDone()).toBe(true)
  })

  it('fetches nothing when maxPages is zero', async () => {
    mockApi()
      .get(ACCOUNTS)
      .reply(200, { d: { results: [{ ID: 'g1' }] } })

    const api = client()
    expect(await collect(api.pageOData(ACCOUNTS, {}, { maxPages: 0 }))).toEqual(
      [],
    )
    expect(api.lastNext).toBeNull()
    expect(nock.pendingMocks()).toHaveLength(1)
  })

  it('refuses an off-host __next', async () => {
    mockApi()
      .get(ACCOUNTS)
      .reply(200, {
        d: {
          results: [{ ID: 'g1' }],
          __next: 'https://evil.example.com/api/v1/steal',
        },
      })

    const err = await collect(client().pageOData(ACCOUNTS)).catch((e) => e)
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe(
      `Refusing to send request outside ${BASE}: https://evil.example.com`,
    )
  })

  it('yields nothing when the envelope carries no results', async () => {
    mockApi().get(ACCOUNTS).reply(200, { d: {} })

    const api = client()
    expect(await collect(api.pageOData(ACCOUNTS))).toEqual([])
    expect(api.lastNext).toBeNull()
  })

  it('yields nothing for a body without an envelope', async () => {
    mockApi().get(ACCOUNTS).reply(200, '')

    expect(await collect(client().pageOData(ACCOUNTS))).toEqual([])
  })

  it('yields nothing for a 204', async () => {
    mockApi().get(ACCOUNTS).reply(204)

    expect(await collect(client().pageOData(ACCOUNTS))).toEqual([])
  })
})
