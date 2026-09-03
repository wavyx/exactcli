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
import descriptor from '../../../src/lib/typed/descriptors/financial-period.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-financial-period-'))

const { default: Cmd } =
  await import('../../../src/commands/financial-period/list.js')

const PATH = '/api/v1/123/financial/FinancialPeriods'
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

describe('financial-period list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('financial-period')
    expect(descriptor.resource).toBe('financial/FinancialPeriods')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by start date, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              FinYear: 2026,
              FinPeriod: 1,
              StartDate: '/Date(1767225600000)/',
              EndDate: '/Date(1769817600000)/',
              ID: 'p1',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(ORDER).toBe('StartDate asc')
    expect(out).toEqual([
      {
        FinYear: 2026,
        FinPeriod: 1,
        StartDate: '2026-01-01T00:00:00',
        EndDate: '2026-01-31T00:00:00',
        ID: 'p1',
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
          "FinYear eq 2026 and FinPeriod eq 3 and StartDate ge datetime'2026-01-01' and StartDate le datetime'2026-12-31'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--year',
      '2026',
      '--period',
      '3',
      '--from',
      '2026-01-01',
      '--to',
      '2026-12-31',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--from', 'january']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received january/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
