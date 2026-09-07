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
import descriptor from '../../../src/lib/typed/descriptors/purchase-invoice.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-purchase-invoice-'))

const { default: Cmd } =
  await import('../../../src/commands/purchase-invoice/list.js')

const PATH = '/api/v1/123/purchase/PurchaseInvoices'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const GUID = '22222222-2222-2222-2222-222222222222'
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

describe('purchase-invoice list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('purchase-invoice')
    expect(descriptor.resource).toBe('purchase/PurchaseInvoices')
    expect(descriptor.orderBy).toBe('InvoiceDate desc')
    expect(descriptor.columns.at(-1)).toBe('ID')
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
              EntryNumber: 26600001,
              InvoiceDate: '/Date(1723990800000)/',
              YourRef: 'ACME-2024-001',
              Amount: 242,
              Status: 20,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        EntryNumber: 26600001,
        InvoiceDate: '2024-08-18T14:20:00',
        YourRef: 'ACME-2024-001',
        Amount: 242,
        Status: 20,
      },
    ])
  })

  it('renders its typed filters, resolves the supplier code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '2001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          `Supplier eq guid'${GUID}' and InvoiceDate ge datetime'2026-01-01'` +
          " and InvoiceDate le datetime'2026-01-31T23:59:59' and Status eq 20",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--supplier',
      '2001',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-31',
      '--status',
      '20',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--to', '31/01/2026']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received 31\/01\/2026/)
  })

  it('fails with 64 on a bad status before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'draft']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received draft/)
  })
})
