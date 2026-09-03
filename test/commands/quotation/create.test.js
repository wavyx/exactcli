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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-quotation-create-'))

const { default: Cmd } =
  await import('../../../src/commands/quotation/create.js')

const ACCOUNT = '11111111-1111-1111-1111-111111111111'
const ITEM = '22222222-2222-2222-2222-222222222222'
const QUOTATION = '33333333-3333-3333-3333-333333333333'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const ITEMS = '/api/v1/123/logistics/Items'
const QUOTATIONS = '/api/v1/123/crm/Quotations'
const BASE = ['--account', '1001']

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

/** The account lookup by code, then the item lookup by code. */
const mockLookups = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: ACCOUNT }] } })
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

describe('quotation create', () => {
  it('--dry-run resolves the account and the item and sends no POST', async () => {
    const lookups = mockLookups()
    const post = mockApi().post(QUOTATIONS).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--line', 'Default:2:100', '--dry-run']),
    )

    expect(lookups.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: QUOTATIONS,
      body: {
        OrderAccount: ACCOUNT,
        QuotationLines: [{ Item: ITEM, Quantity: 2, UnitPrice: 100 }],
      },
    })
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const lookups = mockLookups()

    const err = await fail([...BASE, '--line', 'Default:2:100'])

    expect(exit(err)).toBe(77)
    expect(lookups.isDone()).toBe(false)
  })

  it('POSTs the quotation with --allow-writes and prints the record', async () => {
    const scope = mockLookups()
      .post(QUOTATIONS, {
        OrderAccount: ACCOUNT,
        Description: 'Consulting',
        QuotationDate: '2026-09-03',
        CloseDate: '2026-09-30',
        YourRef: 'PO-42',
        QuotationLines: [
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
          QuotationID: QUOTATION,
          AmountDC: 200,
          QuotationNumber: 1,
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
        '--close-date',
        '2026-09-30',
        '--reference',
        'PO-42',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      QuotationID: QUOTATION,
      AmountDC: 200,
      QuotationNumber: 1,
    })
  })

  it('passes a GUID account and a GUID item through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--account',
        ACCOUNT,
        '--line',
        `${ITEM}:1:50`,
        '--dry-run',
      ]),
    )

    expect(out.body).toEqual({
      OrderAccount: ACCOUNT,
      QuotationLines: [{ Item: ITEM, Quantity: 1, UnitPrice: 50 }],
    })
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

  it('fails with 64 on a bad --close-date, before the gate', async () => {
    const err = await fail([
      ...BASE,
      '--line',
      'Default:2:100',
      '--close-date',
      'tomorrow',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--close-date expects YYYY-MM-DD/)
  })

  it('fails with 64 without --line', async () => {
    const err = await fail([...BASE, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag line/)
  })
})
