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
import { descriptors } from '../../../src/lib/typed/descriptors.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-transaction-line-'))

const { default: Cmd } =
  await import('../../../src/commands/transaction-line/list.js')

const PATH = '/api/v1/123/financialtransaction/TransactionLines'
const SELECT = descriptors.transactionLine.columns.join(',')
const ORDER = descriptors.transactionLine.orderBy

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

describe('transaction-line list', () => {
  it('is the typed command of its descriptor', () => {
    expect(Cmd.descriptor).toBe(descriptors.transactionLine)
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Date: '/Date(1723990800000)/',
              AmountDC: 100,
              GLAccountCode: '700000',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { Date: '2024-08-18T14:20:00', AmountDC: 100, GLAccountCode: '700000' },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "FinancialYear eq 2026 and FinancialPeriod eq 9 and Date ge datetime'2026-09-01' and Date le datetime'2026-09-30T23:59:59' and GLAccountCode eq '700000' and JournalCode eq '70'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--year',
      '2026',
      '--period',
      '9',
      '--from',
      '2026-09-01',
      '--to',
      '2026-09-30',
      '--gl-account',
      '700000',
      '--journal',
      '70',
    ])

    expect(scope.isDone()).toBe(true)
  })
})
