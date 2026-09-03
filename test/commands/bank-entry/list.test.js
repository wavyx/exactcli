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
import descriptor from '../../../src/lib/typed/descriptors/bank-entry.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-bank-entry-'))

const { default: Cmd } =
  await import('../../../src/commands/bank-entry/list.js')

const PATH = '/api/v1/123/financialtransaction/BankEntries'
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

describe('bank-entry list', () => {
  it('is the typed command of a descriptor that the catalogue validates', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('bank-entry')
    expect(descriptor.resource).toBe('financialtransaction/BankEntries')
    expect(descriptor.columns.at(-1)).toBe('EntryID')
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by entry number, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: 'EntryNumber desc' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              EntryNumber: 26550001,
              JournalCode: '55',
              OpeningBalanceFC: 100.5,
              ClosingBalanceFC: 80,
              StatusDescription: 'Processed',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        EntryNumber: 26550001,
        JournalCode: '55',
        OpeningBalanceFC: 100.5,
        ClosingBalanceFC: 80,
        StatusDescription: 'Processed',
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "JournalCode eq '55' and FinancialYear eq 2026 and FinancialPeriod eq 9",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--journal', '55', '--year', '2026', '--period', '9'])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects a non-integer --year with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    const err = await Cmd.run(['--year', '2026-01']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(scope.isDone()).toBe(false)
  })
})
