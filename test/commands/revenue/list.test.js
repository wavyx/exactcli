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
import descriptor from '../../../src/lib/typed/descriptors/revenue.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-revenue-'))

const { default: Cmd } = await import('../../../src/commands/revenue/list.js')

const PATH = '/api/v1/123/read/financial/RevenueList'
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

describe('revenue list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('revenue')
    expect(descriptor.resource).toBe('read/financial/RevenueList')
    expect(descriptor.orderBy).toBe('Year desc')
    expect(descriptor.columns).toEqual(['Year', 'Period', 'Amount'])
  })

  it('selects the descriptor columns, orders by year, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Year: 2026,
              Period: 1,
              Amount: 12500.75,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Year: 2026, Period: 1, Amount: 12500.75 }])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: 'Year eq 2026 and Period eq 3',
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--year', '2026', '--period', '3'])

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
