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
import { resetCatalog, validateDescriptor } from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/sales-order.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sales-order-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-order/list.js')

const PATH = '/api/v1/123/salesorder/SalesOrders'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const GUID = '11111111-1111-1111-1111-111111111111'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy

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

describe('sales-order list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('sales-order')
    expect(descriptor.resource).toBe('salesorder/SalesOrders')
    expect(descriptor.orderBy).toBe('OrderDate desc')
    expect(descriptor.columns.at(-1)).toBe('OrderID')
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              OrderNumber: 26800001,
              OrderDate: '/Date(1723990800000)/',
              OrderedByName: 'Acme',
              AmountDC: 121,
              DeliveryDate: null,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        OrderNumber: 26800001,
        OrderDate: '2024-08-18T14:20:00',
        OrderedByName: 'Acme',
        AmountDC: 121,
        DeliveryDate: null,
      },
    ])
  })

  it('renders its typed filters, resolves the customer code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          `OrderedBy eq guid'${GUID}' and OrderDate ge datetime'2026-01-01'` +
          " and OrderDate le datetime'2026-01-31' and Status eq 12" +
          " and substringof('acme', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--customer',
      '1001',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-31',
      '--status',
      '12',
      '--search',
      'acme',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--to', 'tomorrow']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received tomorrow/)
  })

  it('fails with 64 on a bad status before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'open']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received open/)
  })
})
