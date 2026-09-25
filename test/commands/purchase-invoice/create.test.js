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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-purchase-invoice-'))

const { default: Cmd } =
  await import('../../../src/commands/purchase-invoice/create.js')

const SUPPLIER = '11111111-1111-1111-1111-111111111111'
const ITEM = '22222222-2222-2222-2222-222222222222'
const INVOICE = '33333333-3333-3333-3333-333333333333'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const ITEMS = '/api/v1/123/logistics/Items'
const INVOICES = '/api/v1/123/purchase/PurchaseInvoices'
const BASE = ['--supplier', '2001', '--journal', '600']

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

/** The supplier lookup by code, then the item lookup by code. */
/**
 * The financial period that covers the invoice date: the given one, or today
 * without --date.
 */
const mockPeriod = (date) =>
  mockApi()
    .get('/api/v1/123/financial/FinancialPeriods')
    .query(
      (q) =>
        q.$select === 'FinYear,FinPeriod' &&
        q.$top === '1' &&
        (date
          ? q.$filter ===
            `StartDate le datetime'${date}' and EndDate ge datetime'${date}'`
          : /^StartDate le datetime'\d{4}-\d{2}-\d{2}' and EndDate ge/.test(
              q.$filter,
            )),
    )
    .reply(200, { d: { results: [{ FinYear: 2026, FinPeriod: 9 }] } })

const mockLookups = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '2001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: SUPPLIER }] } })
    .get(ITEMS)
    .query({
      $filter: "Code eq 'Default'",
      $select: 'ID,Code,Description',
      $top: '2',
    })
    .reply(200, { d: { results: [{ ID: ITEM }] } })

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('purchase-invoice create', () => {
  it('--dry-run resolves the supplier, the item and the period of today, and sends no POST', async () => {
    const lookups = mockLookups()
    const period = mockPeriod()
    const post = mockApi().post(INVOICES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--line', 'Default:2:100', '--dry-run']),
    )

    expect(lookups.isDone()).toBe(true)
    expect(period.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: INVOICES,
      body: {
        Journal: '600',
        Supplier: SUPPLIER,
        Type: 8033,
        PurchaseInvoiceLines: [{ Item: ITEM, Quantity: 2, UnitPrice: 100 }],
        FinancialYear: 2026,
        FinancialPeriod: 9,
      },
    })
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const lookups = mockLookups()

    const err = await fail([...BASE, '--line', 'Default:2:100'])

    expect(exit(err)).toBe(77)
    expect(lookups.isDone()).toBe(false)
  })

  it('POSTs the invoice with --allow-writes and prints the record', async () => {
    // Exact refuses a purchase invoice without its financial year (verified
    // live): the period comes from the invoice date.
    mockPeriod('2026-09-03')
    const scope = mockLookups()
      .post(INVOICES, {
        Journal: '600',
        Supplier: SUPPLIER,
        Type: 8033,
        Description: 'Office supplies',
        InvoiceDate: '2026-09-03',
        YourRef: 'INV-2026-42',
        FinancialYear: 2026,
        FinancialPeriod: 9,
        PurchaseInvoiceLines: [
          {
            Item: ITEM,
            Quantity: 2,
            UnitPrice: 100,
            Description: 'Paper: A4',
          },
        ],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID: INVOICE,
          EntryNumber: 26600001,
          Amount: 200,
          Status: 20,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--line',
        'Default:2:100:Paper: A4',
        '--description',
        'Office supplies',
        '--date',
        '2026-09-03',
        '--reference',
        'INV-2026-42',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID: INVOICE,
      EntryNumber: 26600001,
      Amount: 200,
      Status: 20,
    })
  })

  it('passes a GUID supplier and a GUID item through without a code lookup', async () => {
    mockPeriod()
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--supplier',
        SUPPLIER,
        '--journal',
        '600',
        '--type',
        '8034',
        '--line',
        `${ITEM}:1:50`,
        '--dry-run',
      ]),
    )

    expect(out.body.Supplier).toBe(SUPPLIER)
    expect(out.body.Type).toBe(8034)
    expect(out.body.PurchaseInvoiceLines).toEqual([
      { Item: ITEM, Quantity: 1, UnitPrice: 50 },
    ])
  })

  it('fails with 65 when no financial period covers the date', async () => {
    mockApi()
      .get('/api/v1/123/financial/FinancialPeriods')
      .query(true)
      .reply(200, { d: { results: [] } })

    const err = await fail([
      '--supplier',
      SUPPLIER,
      '--journal',
      '600',
      '--line',
      `${ITEM}:1:50`,
      '--date',
      '2031-01-01',
      '--dry-run',
    ])

    expect(exit(err)).toBe(65)
    expect(err.message).toBe(
      'No financial period covers 2031-01-01: create the financial year first',
    )
  })

  it('fails with 64 on a bad --line, before the gate', async () => {
    const err = await fail([...BASE, '--line', 'Default:two:100'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/item:quantity:unit price\[:description\]/)
  })

  it('fails with 64 on a bad --date, before the gate', async () => {
    const err = await fail([
      ...BASE,
      '--line',
      'Default:2:100',
      '--date',
      '03/09/2026',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--date expects YYYY-MM-DD/)
  })

  it('fails with 64 without a --line', async () => {
    const err = await fail(BASE)

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag line/)
  })
})
