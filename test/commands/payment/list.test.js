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
import descriptor from '../../../src/lib/typed/descriptors/payment.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-payment-'))

const { default: Cmd } = await import('../../../src/commands/payment/list.js')

const PATH = '/api/v1/123/cashflow/Payments'
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

describe('payment list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('payment')
    expect(descriptor.resource).toBe('cashflow/Payments')
    expect(descriptor.orderBy).toBe('DueDate asc')
    expect(descriptor.columns.at(-1)).toBe('ID')
  })

  it('selects the descriptor columns, orders by due date, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              AccountCode: '2001',
              AccountName: 'Acme',
              DueDate: '/Date(1723990800000)/',
              AmountDC: 121,
              Status: 20,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        AccountCode: '2001',
        AccountName: 'Acme',
        DueDate: '2024-08-18T14:20:00',
        AmountDC: 121,
        Status: 20,
      },
    ])
  })

  it('renders its typed filters, resolves the account code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '2001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          `Account eq guid'${GUID}' and DueDate ge datetime'2026-01-01'` +
          " and DueDate le datetime'2026-12-31' and Status eq 20" +
          " and substringof('rent', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--account',
      '2001',
      '--due-from',
      '2026-01-01',
      '--due-to',
      '2026-12-31',
      '--status',
      '20',
      '--search',
      'rent',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--due-to', 'tomorrow']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received tomorrow/)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('fails with 64 on a bad status before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'open']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received open/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
