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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sales-entry-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-entry/create.js')

const CUSTOMER = '11111111-1111-1111-1111-111111111111'
const REVENUE = '22222222-2222-2222-2222-222222222222'
const ENTRY_ID = '33333333-3333-3333-3333-333333333333'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const ENTRIES = '/api/v1/123/salesentry/SalesEntries'
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

/** The customer lookup by code, then the ledger account lookup by code. */
const mockLookups = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: CUSTOMER }] } })
    .get(GL_ACCOUNTS)
    .query({
      $filter: "Code eq '700000'",
      $select: 'ID,Code,Description',
      $top: '2',
    })
    .reply(200, { d: { results: [{ ID: REVENUE }] } })

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('sales-entry create', () => {
  it('--dry-run resolves the customer and the account and sends no POST', async () => {
    const lookups = mockLookups()
    const post = mockApi().post(ENTRIES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--line', '700000:100', '--dry-run']),
    )

    expect(lookups.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: ENTRIES,
      body: {
        Customer: CUSTOMER,
        Journal: '700',
        SalesEntryLines: [{ GLAccount: REVENUE, AmountFC: 100 }],
      },
    })
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const lookups = mockLookups()

    const err = await fail([...BASE, '--line', '700000:100'])

    expect(exit(err)).toBe(77)
    expect(lookups.isDone()).toBe(false)
  })

  it('POSTs the entry with --allow-writes and prints the record', async () => {
    const scope = mockLookups()
      .post(ENTRIES, {
        Customer: CUSTOMER,
        Journal: '700',
        Description: 'Consulting',
        EntryDate: '2026-09-03',
        YourRef: 'PO-42',
        SalesEntryLines: [
          {
            GLAccount: REVENUE,
            AmountFC: 100.5,
            Description: 'Day rate: senior',
          },
        ],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          EntryID: ENTRY_ID,
          EntryNumber: 26700001,
          StatusDescription: 'Ouvert',
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--line',
        '700000:100.5:Day rate: senior',
        '--description',
        'Consulting',
        '--date',
        '2026-09-03',
        '--invoice',
        'PO-42',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      EntryID: ENTRY_ID,
      EntryNumber: 26700001,
      StatusDescription: 'Ouvert',
    })
  })

  it('passes a GUID customer and a GUID account through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--customer',
        CUSTOMER,
        '--journal',
        '700',
        '--line',
        `${REVENUE}:-25`,
        '--dry-run',
      ]),
    )

    expect(out.body.Customer).toBe(CUSTOMER)
    expect(out.body.SalesEntryLines).toEqual([
      { GLAccount: REVENUE, AmountFC: -25 },
    ])
  })

  it('fails with 64 on a bad --line, before the gate', async () => {
    for (const line of ['700000', '700000:abc', ':100', '700000:1e3']) {
      const err = await fail([...BASE, '--line', line])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/<gl account>:<amount>\[:description\]/)
    }
  })

  it('fails with 64 on a bad --date, before the gate', async () => {
    const err = await fail([
      ...BASE,
      '--line',
      '700000:100',
      '--date',
      '03/09/2026',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/YYYY-MM-DD/)
  })

  it('fails with 64 without a --line', async () => {
    const err = await fail(BASE)

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag line/)
  })
})
