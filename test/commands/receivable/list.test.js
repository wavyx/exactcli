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
import descriptor from '../../../src/lib/typed/descriptors/receivable.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-receivable-'))

const { default: Cmd } =
  await import('../../../src/commands/receivable/list.js')

const PATH = '/api/v1/123/cashflow/Receivables'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy
const GUID = '11111111-1111-1111-1111-111111111111'

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

describe('receivable list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('receivable')
    expect(descriptor.resource).toBe('cashflow/Receivables')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
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
    expect(ORDER).toBe('DueDate asc')
    expect(out).toEqual([
      {
        AccountName: 'Acme',
        DueDate: '2024-08-18T14:20:00',
        AmountDC: 121,
        Status: 20,
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
          `substringof('rent', Description) and Account eq guid'${GUID}'` +
          " and DueDate ge datetime'2026-01-01' and DueDate le datetime'2026-12-31'" +
          ' and Status eq 20',
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'rent',
      '--account',
      GUID,
      '--due-from',
      '2026-01-01',
      '--due-to',
      '2026-12-31',
      '--status',
      '20',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('resolves an account code through crm/Accounts', async () => {
    const scope = mockApi()
      .get('/api/v1/123/crm/Accounts')
      .query({ $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `Account eq guid'${GUID}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--account', 'ACME'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--due-from', 'tomorrow']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received tomorrow/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
