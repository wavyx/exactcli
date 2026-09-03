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
import descriptor from '../../../src/lib/typed/descriptors/payment-condition.js'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-payment-condition-'),
)

const { default: Cmd } =
  await import('../../../src/commands/payment-condition/list.js')

const PATH = '/api/v1/123/cashflow/PaymentConditions'
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

describe('payment-condition list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('payment-condition')
    expect(descriptor.resource).toBe('cashflow/PaymentConditions')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Code: '30',
              Description: '30 days',
              PaymentDays: 30,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(ORDER).toBe('Code asc')
    expect(out).toEqual([
      { Code: '30', Description: '30 days', PaymentDays: 30 },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('days', Description) and PaymentMethod eq 'B' and PaymentDays eq 30",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'days', '--method', 'B', '--days', '30'])

    expect(scope.isDone()).toBe(true)
  })

  it('searches an exact code when the search value is digits', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `(Code eq '30' or Code eq '${'30'.padStart(18, ' ')}')`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', '30'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad integer before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--days', 'thirty']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received thirty/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
