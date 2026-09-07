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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-item-update-'))

const { default: Cmd } = await import('../../../src/commands/item/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const GL_REVENUE = '22222222-2222-2222-2222-222222222222'
const ITEMS = '/api/v1/123/logistics/Items'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const KEYED = `${ITEMS}(guid'${GUID}')`
const LOOKUP = {
  $filter: "Code eq 'WIDGET'",
  $select: 'ID,Code,Description',
  $top: '2',
}

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

/** The lookup of code WIDGET, then the PUT on the found record. */
const mockLookupAndPut = (body) =>
  mockApi()
    .get(ITEMS)
    .query(LOOKUP)
    .reply(200, { d: { results: [{ ID: GUID }] } })
    .put(KEYED, body)
    .reply(204)

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('item update', () => {
  it('--dry-run resolves the code id and the ledger account and sends no PUT', async () => {
    const scope = mockLookupAndPut()
    const ledger = mockApi()
      .get(GL_ACCOUNTS)
      .query({
        $filter: "Code eq '700000'",
        $select: 'ID,Code,Description',
        $top: '2',
      })
      .reply(200, { d: { results: [{ ID: GL_REVENUE }] } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'WIDGET',
        '--description',
        'Widget XL',
        '--gl-revenue',
        '700000',
        '--dry-run',
      ]),
    )

    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { Description: 'Widget XL', GLRevenue: GL_REVENUE },
    })
    expect(ledger.isDone()).toBe(true)
    expect(scope.pendingMocks()).toHaveLength(1)
  })

  it('refuses without --allow-writes and sends nothing, not even the lookup', async () => {
    const scope = mockLookupAndPut()

    const err = await fail(['WIDGET', '--description', 'Widget XL'])

    expect(exit(err)).toBe(77)
    expect(scope.pendingMocks()).toHaveLength(2)
  })

  it('PUTs only the given fields on a GUID id, without a lookup', async () => {
    const scope = mockApi()
      .put(KEYED, { Unit: 'pc', StandardSalesPrice: 99.5, IsSalesItem: true })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--sales-price',
        '99.5',
        '--sales',
        'true',
        '--unit',
        'pc',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: KEYED,
      key: GUID,
      fields: ['Unit', 'StandardSalesPrice', 'IsSalesItem'],
    })
  })

  it('resolves a code id with one lookup and prints a human line in a terminal', async () => {
    const scope = mockLookupAndPut({ CostPriceStandard: 40 })
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      'WIDGET',
      '--cost-price',
      '40',
      '--allow-writes',
    ])

    expect(scope.isDone()).toBe(true)
    expect(out).toBe('Updated logistics/Items WIDGET: CostPriceStandard')
  })

  it('fails with 64 when no field is given', async () => {
    const err = await fail([GUID, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Nothing to update/)
  })

  it('fails with 64 on a bad --sales-price and a bad --stock, before the gate', async () => {
    const price = await fail([GUID, '--sales-price', 'abc'])
    expect(exit(price)).toBe(64)
    expect(price.message).toMatch(/--sales-price expects a number/)
    const stock = await fail([GUID, '--stock', 'maybe'])
    expect(exit(stock)).toBe(64)
    expect(stock.message).toMatch(/Expected true or false, received maybe/)
  })

  it('has no --code flag: the code is the key of an item', async () => {
    const err = await fail([GUID, '--code', 'WIDGET2', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--code/)
  })
})
