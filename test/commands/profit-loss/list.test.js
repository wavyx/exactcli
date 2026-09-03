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
import descriptor from '../../../src/lib/typed/descriptors/profit-loss.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-profit-loss-'))

const { default: Cmd } =
  await import('../../../src/commands/profit-loss/list.js')

const PATH = '/api/v1/123/read/financial/ProfitLossOverview'
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

describe('profit-loss list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('profit-loss')
    expect(descriptor.resource).toBe('read/financial/ProfitLossOverview')
    expect(descriptor.orderBy).toBe('CurrentYear desc')
    expect(descriptor.columns.at(-1)).toBe('CurrentYear')
    // The catalogue marks no filterable field on this single-record overview.
    expect(descriptor.filters).toEqual({})
  })

  it('selects the descriptor columns, orders by year, normalizes the record', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              CurrentYear: 2026,
              CurrentPeriod: 9,
              RevenueCurrentPeriod: 1000,
              CostsCurrentPeriod: 400,
              ResultCurrentPeriod: 600,
              RevenueCurrentYear: 9000,
              CostsCurrentYear: 3600,
              ResultCurrentYear: 5400,
              CurrencyCode: 'EUR',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        CurrentYear: 2026,
        CurrentPeriod: 9,
        RevenueCurrentPeriod: 1000,
        CostsCurrentPeriod: 400,
        ResultCurrentPeriod: 600,
        RevenueCurrentYear: 9000,
        CostsCurrentYear: 3600,
        ResultCurrentYear: 5400,
        CurrencyCode: 'EUR',
      },
    ])
  })

  it('passes a raw --filter through unchanged', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: 'CurrentYear eq 2026',
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--filter', 'CurrentYear eq 2026'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad limit before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--limit', 'ten']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer/)
  })
})
