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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sales-entry-'))
const FILES_DIR = mkdtempSync(join(tmpdir(), 'exactcli-sales-files-'))

const { default: Cmd } =
  await import('../../../src/commands/sales-entry/create.js')

const CUSTOMER = '11111111-1111-1111-1111-111111111111'
const REVENUE = '22222222-2222-2222-2222-222222222222'
const ENTRY_ID = '33333333-3333-3333-3333-333333333333'
const DOC = '44444444-4444-4444-4444-444444444444'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const ENTRIES = '/api/v1/123/salesentry/SalesEntries'
const DOCUMENTS = '/api/v1/123/documents/Documents'
const ATTACHMENTS = '/api/v1/123/documents/DocumentAttachments'
const BASE = ['--customer', '1001', '--journal', '700']
const FILE_A = join(FILES_DIR, 'a.txt')
const FILE_B = join(FILES_DIR, 'b.bin')
const BYTES_B = Buffer.from([0, 255, 10])
const FILES = ['--file', FILE_A, '--file', FILE_B]
const b64 = (bytes) => Buffer.from(bytes).toString('base64')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
  writeFileSync(FILE_A, 'hello')
  writeFileSync(FILE_B, BYTES_B)
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  rmSync(FILES_DIR, { recursive: true, force: true })
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

/** The document, one attachment per file, then the entry; bodies in order. */
function mockAttach(calls) {
  const record = (body) => {
    calls.push(body)
    return true
  }
  return mockLookups()
    .post(DOCUMENTS, record)
    .reply(201, { d: { __metadata: { uri: 'x' }, ID: DOC, Type: 10 } })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: '1' } })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: '2' } })
    .post(ENTRIES, record)
    .reply(201, {
      d: { __metadata: { uri: 'x' }, EntryID: ENTRY_ID, EntryNumber: 26700002 },
    })
}

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('sales-entry create', () => {
  it('--file POSTs a document, the attachments, then the entry with Document', async () => {
    const calls = []
    const scope = mockAttach(calls)

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--line',
        '700000:100',
        '--description',
        'Consulting',
        ...FILES,
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(calls).toEqual([
      { Subject: 'Consulting', Type: 10 },
      { Document: DOC, FileName: 'a.txt', Attachment: b64('hello') },
      { Document: DOC, FileName: 'b.bin', Attachment: b64(BYTES_B) },
      {
        Customer: CUSTOMER,
        Journal: '700',
        Description: 'Consulting',
        SalesEntryLines: [{ GLAccount: REVENUE, AmountFC: 100 }],
        Document: DOC,
      },
    ])
    expect(out).toEqual({
      EntryID: ENTRY_ID,
      EntryNumber: 26700002,
      document: DOC,
    })
  })

  it('--dry-run with --file prints a placeholder document and the file sizes', async () => {
    const lookups = mockLookups()
    const posts = mockApi()
      .post(DOCUMENTS)
      .reply(201, { d: {} })
      .post(ENTRIES)
      .reply(201, { d: {} })

    const text = await runCmd(Cmd, [
      ...BASE,
      '--line',
      '700000:100',
      ...FILES,
      '--dry-run',
    ])

    expect(lookups.isDone()).toBe(true)
    expect(posts.isDone()).toBe(false)
    expect(JSON.parse(text)).toEqual({
      method: 'POST',
      path: ENTRIES,
      body: {
        Customer: CUSTOMER,
        Journal: '700',
        SalesEntryLines: [{ GLAccount: REVENUE, AmountFC: 100 }],
        Document: '<new document>',
      },
      attachments: [
        { fileName: 'a.txt', size: 5 },
        { fileName: 'b.bin', size: 3 },
      ],
    })
    expect(text).not.toContain(b64('hello'))
  })

  it('fails with 65 on a missing --file before any request', async () => {
    const scope = mockLookups().post(DOCUMENTS).reply(201, { d: {} })
    const missing = join(FILES_DIR, 'missing.pdf')

    const err = await fail([
      ...BASE,
      '--line',
      '700000:100',
      '--file',
      FILE_A,
      '--file',
      missing,
      '--allow-writes',
    ])

    expect(exit(err)).toBe(65)
    expect(err.message).toContain(missing)
    expect(scope.isDone()).toBe(false)
  })

  it('refuses a write with --file before any request', async () => {
    const scope = mockLookups().post(DOCUMENTS).reply(201, { d: {} })

    const err = await fail([...BASE, '--line', '700000:100', ...FILES])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

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
      expect(err.message).toMatch(
        /<gl account>:<amount>\[:option=value\.\.\.\]\[:description\]/,
      )
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

  it('--credit-note sends Type 21, and the line takes VAT and a period', async () => {
    mockLookups()

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--line',
        '700000:-500:vat=F:from=2026-01-01:to=2026-06-30:Licence',
        '--credit-note',
        '--dry-run',
      ]),
    )

    expect(out.body.Type).toBe(21)
    expect(out.body.SalesEntryLines).toEqual([
      {
        GLAccount: REVENUE,
        AmountFC: -500,
        VATCode: 'F',
        From: '2026-01-01',
        To: '2026-06-30',
        Description: 'Licence',
      },
    ])
  })

  it('refuses the purchase-only VAT options with 64', async () => {
    const err = await fail([...BASE, '--line', '700000:10:non-deductible=0.5'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/unknown option non-deductible/)
  })
})
