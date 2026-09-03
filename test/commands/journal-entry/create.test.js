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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-journal-entry-'))

const { default: Cmd } =
  await import('../../../src/commands/journal-entry/create.js')

const GUID_A = '11111111-1111-1111-1111-111111111111'
const GUID_B = '22222222-2222-2222-2222-222222222222'
const ENTRY_ID = '33333333-3333-3333-3333-333333333333'
const ENTRIES = '/api/v1/123/generaljournalentry/GeneralJournalEntries'
const GL_ACCOUNTS = '/api/v1/123/financial/GLAccounts'
const lookup = (code) => ({
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

const mockLookups = () =>
  mockApi()
    .get(GL_ACCOUNTS)
    .query(lookup('499000'))
    .reply(200, { d: { results: [{ ID: GUID_A }] } })
    .get(GL_ACCOUNTS)
    .query(lookup('580600'))
    .reply(200, { d: { results: [{ ID: GUID_B }] } })

describe('journal-entry create', () => {
  it('--dry-run resolves the codes and prints the request, no POST', async () => {
    const scope = mockLookups()
    const post = mockApi().post(ENTRIES).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '800',
        '--line',
        '499000:50:Rent:September',
        '--line',
        '580600:-50',
        '--date',
        '2026-09-03',
        '--description',
        'OD 12',
        '--dry-run',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: ENTRIES,
      body: {
        JournalCode: '800',
        GeneralJournalEntryLines: [
          {
            GLAccount: GUID_A,
            AmountFC: 50,
            Description: 'Rent:September',
            Date: '2026-09-03',
          },
          {
            GLAccount: GUID_B,
            AmountFC: -50,
            Description: 'OD 12',
            Date: '2026-09-03',
          },
        ],
      },
    })
  })

  it('POSTs with --allow-writes and prints the created record', async () => {
    const scope = mockLookups()
      .post(ENTRIES, {
        JournalCode: '800',
        GeneralJournalEntryLines: [
          { GLAccount: GUID_A, AmountFC: 50 },
          { GLAccount: GUID_B, AmountFC: -50 },
        ],
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          EntryID: ENTRY_ID,
          EntryNumber: 26800001,
          StatusDescription: 'Ouvert',
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '800',
        '--line',
        '499000:50',
        '--line',
        '580600:-50',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      EntryID: ENTRY_ID,
      EntryNumber: 26800001,
      StatusDescription: 'Ouvert',
    })
  })

  it('passes a GUID account through without a lookup', async () => {
    const scope = mockApi()
      .get(GL_ACCOUNTS)
      .query(lookup('580600'))
      .reply(200, { d: { results: [{ ID: GUID_B }] } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '800',
        '--line',
        `${GUID_A}:12.34`,
        '--line',
        '580600:-12.34',
        '--dry-run',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out.body.GeneralJournalEntryLines).toEqual([
      { GLAccount: GUID_A, AmountFC: 12.34 },
      { GLAccount: GUID_B, AmountFC: -12.34 },
    ])
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const scope = mockLookups()

    const err = await fail([
      '--journal',
      '800',
      '--line',
      '499000:50',
      '--line',
      '580600:-50',
    ])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('fails with 64 on unbalanced lines without any request', async () => {
    const scope = mockLookups()

    const err = await fail([
      '--journal',
      '800',
      '--line',
      '499000:50',
      '--line',
      '580600:-40.5',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/9\.50/)
    expect(scope.isDone()).toBe(false)
  })

  it('accepts rounding noise below 0.005', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--journal',
        '800',
        '--line',
        `${GUID_A}:0.1`,
        '--line',
        `${GUID_A}:0.2`,
        '--line',
        `${GUID_B}:-0.3`,
        '--dry-run',
      ]),
    )

    expect(out.body.GeneralJournalEntryLines).toHaveLength(3)
  })

  it('fails with 64 on fewer than two lines', async () => {
    const err = await fail(['--journal', '800', '--line', `${GUID_A}:0`])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/at least two --line/)
  })

  it('fails with 64 on a bad line shape', async () => {
    for (const line of ['499000', '499000:abc', ':50', '499000:1e3']) {
      const err = await fail([
        '--journal',
        '800',
        '--line',
        line,
        '--line',
        '580600:-50',
      ])
      expect(exit(err)).toBe(64)
      expect(err.message).toMatch(/--line expects/)
    }
  })

  it('fails with 64 on a bad date', async () => {
    const err = await fail([
      '--journal',
      '800',
      '--line',
      `${GUID_A}:50`,
      '--line',
      `${GUID_B}:-50`,
      '--date',
      '03/09/2026',
    ])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/YYYY-MM-DD/)
  })
})
