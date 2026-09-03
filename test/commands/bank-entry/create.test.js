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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-bank-entry-'))

const { default: Cmd } =
  await import('../../../src/commands/bank-entry/create.js')

const GL_A = '11111111-1111-1111-1111-111111111111'
const GL_B = '22222222-2222-2222-2222-222222222222'
const ENTRY_ID = '33333333-3333-3333-3333-333333333333'
const CUSTOMER = '44444444-4444-4444-4444-444444444444'
const ENTRIES = '/api/v1/123/financialtransaction/BankEntries'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const glLookup = (code) => ({
  $filter: `Code eq '${code}'`,
  $select: 'ID,Code,Description',
  $top: '2',
})

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

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

/** The customer lookup by code, then the ledger account lookup by code. */
const mockReceiptLookups = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: CUSTOMER }] } })
    .get(GL_ACCOUNTS)
    .query(glLookup('400000'))
    .reply(200, { d: { results: [{ ID: GL_A }] } })

describe('bank-entry create', () => {
  it('--dry-run resolves the customer and the ledger account, no POST', async () => {
    const scope = mockReceiptLookups()
    const post = mockApi().post(ENTRIES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '500',
        '--line',
        '400000:121:Invoice 26700001:Acme',
        '--account',
        '1001',
        '--date',
        '2026-09-03',
        '--dry-run',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: ENTRIES,
      body: {
        JournalCode: '500',
        BankEntryLines: [
          {
            GLAccount: GL_A,
            AmountFC: 121,
            Description: 'Invoice 26700001:Acme',
            Date: '2026-09-03',
            Account: CUSTOMER,
          },
        ],
      },
    })
  })

  it('POSTs with --allow-writes and prints the created record', async () => {
    const scope = mockApi()
      .get(GL_ACCOUNTS)
      .query(glLookup('656000'))
      .reply(200, { d: { results: [{ ID: GL_A }] } })
      .get(GL_ACCOUNTS)
      .query(glLookup('499000'))
      .reply(200, { d: { results: [{ ID: GL_B }] } })
      .post(ENTRIES, {
        JournalCode: '500',
        BankEntryLines: [
          { GLAccount: GL_A, AmountFC: -12.5, Description: 'Fees' },
          { GLAccount: GL_B, AmountFC: -7.5, Description: 'Bank costs' },
        ],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          EntryID: ENTRY_ID,
          EntryNumber: 26500001,
          StatusDescription: 'Ouvert',
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '500',
        '--line',
        '656000:-12.5:Fees',
        '--line',
        '499000:-7.5',
        '--description',
        'Bank costs',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      EntryID: ENTRY_ID,
      EntryNumber: 26500001,
      StatusDescription: 'Ouvert',
    })
  })

  it('passes a GUID ledger account and a GUID customer through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '500',
        '--line',
        `${GL_A}:50`,
        '--account',
        CUSTOMER,
        '--dry-run',
      ]),
    )

    expect(out.body.BankEntryLines).toEqual([
      { GLAccount: GL_A, AmountFC: 50, Account: CUSTOMER },
    ])
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const scope = mockReceiptLookups()

    const err = await fail([
      '--journal',
      '500',
      '--line',
      '400000:121',
      '--account',
      '1001',
    ])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('fails with 64 on a bad line shape', async () => {
    for (const line of ['400000', '400000:abc', ':50', '400000:1e3']) {
      const err = await fail(['--journal', '500', '--line', line])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/--line expects/)
    }
  })

  it('fails with 64 on a bad date', async () => {
    const err = await fail([
      '--journal',
      '500',
      '--line',
      `${GL_A}:50`,
      '--date',
      '03/09/2026',
    ])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/YYYY-MM-DD/)
  })

  it('fails with 64 without a line', async () => {
    const err = await fail(['--journal', '500'])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/line/)
  })
})
