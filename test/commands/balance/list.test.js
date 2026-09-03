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
import { validateDescriptor } from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/balance.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-balance-'))

const { default: Cmd } = await import('../../../src/commands/balance/list.js')

const PATH = '/api/v1/123/financial/ReportingBalance'
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

describe('balance list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('balance')
    expect(descriptor.resource).toBe('financial/ReportingBalance')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by ledger code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              GLAccountCode: '700000',
              GLAccountDescription: 'Sales',
              ReportingYear: 2026,
              ReportingPeriod: 1,
              AmountDebit: 0,
              AmountCredit: 100,
              Amount: -100,
              Count: 1,
              BalanceType: 'W',
              ID: 1,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(ORDER).toBe('GLAccountCode asc')
    expect(out).toEqual([
      {
        GLAccountCode: '700000',
        GLAccountDescription: 'Sales',
        ReportingYear: 2026,
        ReportingPeriod: 1,
        AmountDebit: 0,
        AmountCredit: 100,
        Amount: -100,
        Count: 1,
        BalanceType: 'W',
        ID: 1,
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
          "ReportingYear eq 2026 and ReportingPeriod eq 3 and GLAccountCode eq '700000' and BalanceType eq 'W' and Status eq 50",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--year',
      '2026',
      '--period',
      '3',
      '--gl-account',
      '700000',
      '--type',
      'W',
      '--status',
      '50',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad year before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--year', 'last']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received last/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
