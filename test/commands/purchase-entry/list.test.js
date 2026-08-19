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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-purchase-entry-'))

const { default: Cmd, COLUMNS } =
  await import('../../../src/commands/purchase-entry/list.js')

const PATH = '/api/v1/123/purchaseentry/PurchaseEntries'
const SELECT = Object.keys(COLUMNS).join(',')

function entry(n) {
  return {
    __metadata: { uri: 'x' },
    EntryID: `00000000-0000-0000-0000-00000000000${n}`,
    EntryNumber: 26700000 + n,
    EntryDate: '/Date(1723990800000)/',
    SupplierName: 'Acme',
    AmountDC: 100 * n,
    Currency: 'EUR',
    Journal: '70',
    StatusDescription: 'Processed',
  }
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

describe('purchase-entry list', () => {
  it('selects the column properties, orders by date, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: 'EntryDate desc' })
      .reply(200, { d: { results: [entry(1)] } })

    const out = JSON.parse(await runCmd(Cmd, []))
    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      expect.objectContaining({
        EntryNumber: 26700001,
        EntryDate: '2024-08-18T14:20:00',
        SupplierName: 'Acme',
      }),
    ])
    expect(out[0].__metadata).toBeUndefined()
  })

  it('lets --select, --orderby and --filter override the defaults', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: 'EntryNumber',
        $orderby: 'EntryNumber asc',
        $filter: "Journal eq '70'",
      })
      .reply(200, { d: { results: [entry(2)] } })

    await runCmd(Cmd, [
      '--select',
      'EntryNumber',
      '--orderby',
      'EntryNumber asc',
      '--filter',
      "Journal eq '70'",
    ])
    expect(scope.isDone()).toBe(true)
  })

  it('--raw keeps the envelope fields', async () => {
    mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [entry(3)] } })

    const out = JSON.parse(await runCmd(Cmd, ['--raw']))
    expect(out[0].__metadata).toEqual({ uri: 'x' })
    expect(out[0].EntryDate).toBe('/Date(1723990800000)/')
  })

  it('renders the fixed columns in table mode', async () => {
    process.stdout.isTTY = true
    mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [entry(4)] } })

    const out = await runCmd(Cmd, [])
    expect(out).toContain('EntryNumber')
    expect(out).toContain('26700004')
    expect(out).toContain('Processed')
  })

  it('--select narrows the table columns to the returned fields', async () => {
    process.stdout.isTTY = true
    mockApi()
      .get(PATH)
      .query(true)
      .reply(200, {
        d: { results: [{ EntryNumber: 26700005, AmountDC: 500 }] },
      })

    const out = await runCmd(Cmd, ['--select', 'EntryNumber,AmountDC'])
    expect(out).toContain('EntryNumber')
    expect(out).toContain('AmountDC')
    expect(out).not.toContain('SupplierName')
  })
})
