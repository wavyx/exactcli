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
import descriptor from '../../../src/lib/typed/descriptors/exchange-rate.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-exchange-rate-'))

const { default: Cmd } =
  await import('../../../src/commands/exchange-rate/list.js')

const PATH = '/api/v1/123/financial/ExchangeRates'
const GUID = '11111111-1111-1111-1111-111111111111'
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

describe('exchange-rate list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('exchange-rate')
    expect(descriptor.resource).toBe('financial/ExchangeRates')
    expect(descriptor.orderBy).toBe('StartDate desc')
    expect(descriptor.columns.at(-1)).toBe('ID')
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
              SourceCurrency: 'USD',
              TargetCurrency: 'EUR',
              Rate: 0.92,
              StartDate: '/Date(1723990800000)/',
              ID: GUID,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        SourceCurrency: 'USD',
        TargetCurrency: 'EUR',
        Rate: 0.92,
        StartDate: '2024-08-18T14:20:00',
        ID: GUID,
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
          "SourceCurrency eq 'USD' and TargetCurrency eq 'EUR'" +
          " and StartDate ge datetime'2026-01-01'" +
          " and StartDate le datetime'2026-03-31T23:59:59'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--source',
      'USD',
      '--target',
      'EUR',
      '--from',
      '2026-01-01',
      '--to',
      '2026-03-31',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await Cmd.run(['--from', 'last-week']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received last-week/)
    expect(scope.isDone()).toBe(false)
  })
})
