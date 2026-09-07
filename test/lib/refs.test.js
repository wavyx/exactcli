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
import { findResource } from '../../src/lib/catalog.js'
import {
  GUID_RE,
  labelField,
  padCode,
  renderKey,
  resolveRef,
} from '../../src/lib/refs.js'

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

describe('padCode', () => {
  it('right-aligns digits in 18 characters and leaves other codes alone', () => {
    expect(padCode('2')).toBe('                 2')
    expect(padCode('ACME')).toBe('ACME')
  })
})

describe('renderKey', () => {
  const currencies = findResource('general/Currencies')
  const BAD = 'Record key of general/Currencies must not contain ? # / \\ %'

  it('quotes a string key and doubles an embedded quote', () => {
    expect(renderKey(currencies, 'general/Currencies', 'EUR')).toBe("('EUR')")
    expect(renderKey(currencies, 'general/Currencies', "O'Neil")).toBe(
      "('O''Neil')",
    )
  })

  it.each(['a?b', 'a/b', 'a%b', 'a\\b', 'a#b', ''])(
    'refuses a string key that cannot travel in a path: %s',
    (id) => {
      let err
      try {
        renderKey(currencies, 'general/Currencies', id)
      } catch (e) {
        err = e
      }
      expect(err.exitCode).toBe(64)
      expect(err.message).toBe(BAD)
    },
  )

  it('keeps a GUID key and an integer key as they are', () => {
    expect(renderKey(findResource('crm/Accounts'), 'crm/Accounts', GUID)).toBe(
      `(guid'${GUID}')`,
    )
    expect(
      renderKey(findResource('system/Divisions'), 'system/Divisions', '123'),
    ).toBe('(123)')
    expect(renderKey(undefined, 'custom/Things', GUID)).toBe(`(guid'${GUID}')`)
    expect(renderKey(undefined, 'custom/Things', '700')).toBe('(700)')
  })
})

describe('labelField', () => {
  it('names the field that labels a record, per the catalogue', () => {
    expect(labelField('crm/Accounts')).toBe('Name')
    expect(labelField('financial/GLAccounts')).toBe('Description')
    expect(labelField('logistics/Items')).toBe('Description')
    expect(labelField('crm/Contacts')).toBe('Code')
    expect(labelField('custom/Things')).toBe('Name')
  })
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

  it('selects Description instead of Name on a ledger account', async () => {
    const scope = mockApi()
      .get('/api/v1/123/financial/GLAccounts')
      .query({
        $filter: "Code eq '700000'",
        $select: 'ID,Code,Description',
        $top: '2',
      })
      .reply(200, {
        d: { results: [{ ID: GUID, Code: '700000', Description: 'Sales' }] },
      })

    expect(await resolveRef(cmd, 'financial/GLAccounts', '700000')).toBe(GUID)
    expect(scope.isDone()).toBe(true)
  })
})
