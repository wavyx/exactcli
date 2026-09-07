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
import descriptor from '../../../src/lib/typed/descriptors/subscription.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-subscription-'))

const { default: Cmd } =
  await import('../../../src/commands/subscription/list.js')

const PATH = '/api/v1/123/subscription/Subscriptions'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
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

describe('subscription list', () => {
  it('is the typed command of a descriptor that the catalogue validates', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('subscription')
    expect(descriptor.resource).toBe('subscription/Subscriptions')
    expect(descriptor.orderBy).toBe('StartDate desc')
    expect(descriptor.columns.at(-1)).toBe('EntryID')
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by start date, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: 'StartDate desc' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Number: 26000001,
              Description: 'Hosting',
              InvoiceToName: 'Acme',
              StartDate: '/Date(1723990800000)/',
              EndDate: null,
              Currency: 'EUR',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Number: 26000001,
        Description: 'Hosting',
        InvoiceToName: 'Acme',
        StartDate: '2024-08-18T14:20:00',
        EndDate: null,
        Currency: 'EUR',
      },
    ])
  })

  it('renders its typed filters, resolves the account code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          `InvoiceTo eq guid'${GUID}' and StartDate ge datetime'2026-01-01'` +
          " and StartDate le datetime'2026-12-31T23:59:59'" +
          " and substringof('hosting', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--account',
      '1001',
      '--from',
      '2026-01-01',
      '--to',
      '2026-12-31',
      '--search',
      'hosting',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('rejects a bad --from date with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--from', '2026/01/01']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received 2026\/01\/01/)
    expect(scope.isDone()).toBe(false)
  })
})
