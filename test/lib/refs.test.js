import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import nock from 'nock'
import { mockApi } from '../helpers.js'
import { createClient } from '../../src/lib/client.js'
import { GUID_RE, resolveRef } from '../../src/lib/refs.js'

const GUID = '11111111-1111-1111-1111-111111111111'
const PATH = '/api/v1/123/crm/Accounts'
const query = (code) => ({
  $filter: `Code eq '${code}'`,
  $select: 'ID,Code,Name',
  $top: '2',
})

let cmd
beforeAll(() => {
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
})
afterAll(() => {
  delete process.env.EXACTCLI_ACCESS_TOKEN
})
beforeEach(() => {
  nock.disableNetConnect()
  cmd = {
    apiClient: createClient({ token: 'test-token', retry: false }),
    resolveDivision: () => 123,
  }
})
afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

describe('resolveRef', () => {
  it('passes a GUID through without a request', async () => {
    expect(await resolveRef(cmd, 'crm/Accounts', GUID)).toBe(GUID)
    expect(GUID_RE.test(GUID)).toBe(true)
  })

  it('looks a code up and returns the ID', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(query('ACME'))
      .reply(200, {
        d: { results: [{ ID: GUID, Code: 'ACME', Name: 'Acme' }] },
      })

    expect(await resolveRef(cmd, 'crm/Accounts', 'ACME')).toBe(GUID)
    expect(scope.isDone()).toBe(true)
  })

  it('retries a numeric code padded to 18 characters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(query('1001'))
      .reply(200, { d: [] })
      .get(PATH)
      .query(query('              1001'))
      .reply(200, {
        d: [{ ID: GUID, Code: '              1001', Name: 'Acme' }],
      })

    expect(await resolveRef(cmd, 'crm/Accounts', '1001')).toBe(GUID)
    expect(scope.isDone()).toBe(true)
  })

  it('doubles a single quote in the code', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $filter: "Code eq 'O''Neil'",
        $select: 'ID,Code,Name',
        $top: '2',
      })
      .reply(200, { d: { results: [{ ID: GUID }] } })

    expect(await resolveRef(cmd, 'crm/Accounts', "O'Neil")).toBe(GUID)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 65 when nothing matches', async () => {
    mockApi()
      .get(PATH)
      .query(query('ZZZ'))
      .reply(200, { d: { results: [] } })

    const err = await resolveRef(cmd, 'crm/Accounts', 'ZZZ').catch((e) => e)
    expect(err.exitCode).toBe(65)
    expect(err.message).toBe('No crm/Accounts with Code ZZZ')
  })

  it('treats an answer without rows as no match', async () => {
    mockApi().get(PATH).query(query('ZZZ')).reply(200, { d: {} })

    const err = await resolveRef(cmd, 'crm/Accounts', 'ZZZ').catch((e) => e)
    expect(err.exitCode).toBe(65)
  })

  it('fails with 65 and lists the candidates when the code is ambiguous', async () => {
    mockApi()
      .get(PATH)
      .query(query('DUP'))
      .reply(200, {
        d: {
          results: [
            { ID: GUID, Code: 'DUP', Name: 'Acme' },
            { ID: GUID.replace('1111', '2222'), Code: 'DUP', Name: 'Globex' },
          ],
        },
      })

    const err = await resolveRef(cmd, 'crm/Accounts', 'DUP').catch((e) => e)
    expect(err.exitCode).toBe(65)
    expect(err.message).toMatch(
      /Ambiguous code DUP on crm\/Accounts: Acme \(.*\), Globex/,
    )
  })
})
