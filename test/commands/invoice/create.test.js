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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-invoice-'))

const { default: Cmd } = await import('../../../src/commands/invoice/create.js')

const CUSTOMER = '11111111-1111-1111-1111-111111111111'
const ITEM = '22222222-2222-2222-2222-222222222222'
const INVOICE = '33333333-3333-3333-3333-333333333333'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const ITEMS = '/api/v1/123/logistics/Items'
const INVOICES = '/api/v1/123/salesinvoice/SalesInvoices'
const BASE = ['--customer', '1001', '--journal', '700']

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

/** The customer lookup by code, then the item lookup by code. */
const mockLookups = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: CUSTOMER }] } })
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

describe('invoice create', () => {
  it('--dry-run resolves the customer and the item and sends no POST', async () => {
    const lookups = mockLookups()
    const post = mockApi().post(INVOICES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--line', 'Default:2:100', '--dry-run']),
    )

    expect(lookups.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: INVOICES,
      body: {
        Journal: '700',
        OrderedBy: CUSTOMER,
        SalesInvoiceLines: [{ Item: ITEM, Quantity: 2, UnitPrice: 100 }],
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
    const scope = mockLookups()
      .post(INVOICES, {
        Journal: '700',
        OrderedBy: CUSTOMER,
        Description: 'Consulting',
        InvoiceDate: '2026-09-03',
        SalesInvoiceLines: [
          {
            Item: ITEM,
            Quantity: 2,
            UnitPrice: 100,
            Description: 'Day rate: senior',
          },
        ],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          InvoiceID: INVOICE,
          AmountDC: 200,
          InvoiceNumber: null,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--line',
        'Default:2:100:Day rate: senior',
        '--description',
        'Consulting',
        '--date',
        '2026-09-03',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      InvoiceID: INVOICE,
      AmountDC: 200,
      InvoiceNumber: null,
    })
  })

  it('passes a GUID customer and a GUID item through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--customer',
        CUSTOMER,
        '--journal',
        '700',
        '--line',
        `${ITEM}:1:50`,
        '--dry-run',
      ]),
    )

    expect(out.body.OrderedBy).toBe(CUSTOMER)
    expect(out.body.SalesInvoiceLines).toEqual([
      { Item: ITEM, Quantity: 1, UnitPrice: 50 },
    ])
  })

  it('fails with 64 on a bad --line, before the gate', async () => {
    const err = await fail([...BASE, '--line', 'Default:two:100'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(
      /item:quantity:unit price\[:option=value\.\.\.\]\[:description\]/,
    )
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
    expect(err.message).toMatch(/YYYY-MM-DD/)
  })

  it('--dry-run sends the line options and the header fields of a credit note', async () => {
    const REVENUE = '44444444-4444-4444-4444-444444444444'
    const scope = mockApi()
      .get('/api/v1/123/financial/GLAccounts')
      .query({
        $filter: "Code eq '700100'",
        $select: 'ID,Code,Description',
        $top: '2',
      })
      .reply(200, { d: { results: [{ ID: REVENUE }] } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--customer',
        CUSTOMER,
        '--journal',
        '700',
        '--line',
        `${ITEM}:-1:1350:vat=F:discount=0.1:gl-account=700100:cost-center=HQ:Fees`,
        '--line',
        `${ITEM}:0:0:vat=F:350 K x 0.45%`,
        '--credit-note',
        '--remarks',
        'Reverse charge',
        '--reference',
        'PO-7',
        '--payment-condition',
        'PR',
        '--dry-run',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out.body).toEqual({
      Journal: '700',
      OrderedBy: CUSTOMER,
      Type: 8021,
      Remarks: 'Reverse charge',
      YourRef: 'PO-7',
      PaymentCondition: 'PR',
      SalesInvoiceLines: [
        {
          Item: ITEM,
          Quantity: -1,
          UnitPrice: 1350,
          VATCode: 'F',
          Discount: 0.1,
          GLAccount: REVENUE,
          CostCenter: 'HQ',
          Description: 'Fees',
        },
        {
          Item: ITEM,
          Quantity: 0,
          UnitPrice: 0,
          VATCode: 'F',
          Description: '350 K x 0.45%',
        },
      ],
    })
  })

  it('--credit-note fails with 64 on a total that is not negative', async () => {
    // Exact keeps Type 8021 but books the quantities as given: a positive
    // credit note would post like an invoice.
    const err = await fail([
      ...BASE,
      '--line',
      'Default:1:100',
      '--credit-note',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toBe(
      '--credit-note needs a negative total: give the lines negative quantities. Exact books the signs as given',
    )
  })

  it('--credit-note counts the discount in the total, and a discount stays up to 1', async () => {
    // A full discount leaves nothing to credit; 2 would turn -100 into +100.
    const full = await fail([
      ...BASE,
      '--line',
      'Default:-1:100:discount=1',
      '--credit-note',
    ])
    expect(exit(full)).toBe(64)
    expect(full.message).toMatch(/--credit-note needs a negative total/)

    const over = await fail([
      ...BASE,
      '--line',
      'Default:-1:100:discount=2',
      '--credit-note',
    ])
    expect(exit(over)).toBe(64)
    expect(over.message).toMatch(
      /option discount expects a fraction from 0 to 1/,
    )

    // A negative discount would turn into a markup.
    const negative = await fail([
      ...BASE,
      '--line',
      'Default:1:100:discount=-5',
    ])
    expect(exit(negative)).toBe(64)
    expect(negative.message).toMatch(/option discount expects a fraction/)
  })

  it('fails with 64 on a bad line option, before the gate', async () => {
    const err = await fail([...BASE, '--line', 'Default:1:10:discount=ten'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/option discount expects a fraction/)
  })
})
