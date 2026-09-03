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
import descriptor from '../../../src/lib/typed/descriptors/receivables-list.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-receivables-list-'))

const { default: Cmd } =
  await import('../../../src/commands/receivables-list/list.js')

const PATH = '/api/v1/123/read/financial/ReceivablesList'
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

describe('receivables-list list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('receivables-list')
    expect(descriptor.resource).toBe('read/financial/ReceivablesList')
    expect(descriptor.orderBy).toBe('DueDate asc')
    expect(descriptor.columns.at(-1)).toBe('HID')
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
              AccountCode: '1001',
              AccountName: 'Acme',
              InvoiceNumber: 26000001,
              InvoiceDate: '/Date(1767225600000)/',
              DueDate: '/Date(1769817600000)/',
              Amount: 1210.5,
              Description: 'Invoice 26000001',
              CurrencyCode: 'EUR',
              HID: 42,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        AccountCode: '1001',
        AccountName: 'Acme',
        InvoiceNumber: 26000001,
        InvoiceDate: '2026-01-01T00:00:00',
        DueDate: '2026-01-31T00:00:00',
        Amount: 1210.5,
        Description: 'Invoice 26000001',
        CurrencyCode: 'EUR',
        HID: 42,
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
          `substringof('acme', AccountName) and AccountId eq guid'${GUID}'` +
          " and DueDate ge datetime'2026-01-01' and DueDate le datetime'2026-01-31'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'acme',
      '--account',
      GUID,
      '--due-from',
      '2026-01-01',
      '--due-to',
      '2026-01-31',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('resolves an account code through crm/Accounts', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `AccountId eq guid'${GUID}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--account', '1001'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad due date before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--due-to', '31/01/2026']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received 31\/01\/2026/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
