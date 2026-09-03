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
import descriptor from '../../../src/lib/typed/descriptors/budget.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-budget-'))

const { default: Cmd } = await import('../../../src/commands/budget/list.js')

const PATH = '/api/v1/123/budget/Budgets'
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

describe('budget list', () => {
  it('is the typed command of a descriptor that the catalogue validates', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('budget')
    expect(descriptor.resource).toBe('budget/Budgets')
    expect(descriptor.orderBy).toBe('GLAccountCode asc')
    expect(descriptor.columns.at(-1)).toBe('ID')
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by ledger code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: 'GLAccountCode asc' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              GLAccountCode: '700000',
              GLAccountDescription: 'Sales',
              ReportingYear: 2026,
              ReportingPeriod: 3,
              AmountDC: 1500.25,
              BudgetScenarioCode: 'BUDGET',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        GLAccountCode: '700000',
        GLAccountDescription: 'Sales',
        ReportingYear: 2026,
        ReportingPeriod: 3,
        AmountDC: 1500.25,
        BudgetScenarioCode: 'BUDGET',
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
          'ReportingYear eq 2026 and ReportingPeriod eq 3' +
          " and GLAccountCode eq '700000' and BudgetScenarioCode eq 'BUDGET'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--year',
      '2026',
      '--period',
      '3',
      '--gl-account',
      '700000',
      '--scenario',
      'BUDGET',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects a non-integer --period with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--period', 'Q1']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received Q1/)
    expect(scope.isDone()).toBe(false)
  })
})
