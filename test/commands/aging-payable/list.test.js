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
import descriptor from '../../../src/lib/typed/descriptors/aging-payable.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-aging-payable-'))

const { default: Cmd } =
  await import('../../../src/commands/aging-payable/list.js')

const PATH = '/api/v1/123/read/financial/AgingPayablesList'
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

describe('aging-payable list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('aging-payable')
    expect(descriptor.resource).toBe('read/financial/AgingPayablesList')
    expect(descriptor.orderBy).toBe('TotalAmount desc')
    expect(descriptor.columns.at(-1)).toBe('AccountId')
  })

  it('selects the descriptor columns, orders by total, normalizes rows', async () => {
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
              TotalAmount: 1210.5,
              AgeGroup1Amount: 1000,
              AgeGroup2Amount: 210.5,
              CurrencyCode: 'EUR',
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
        TotalAmount: 1210.5,
        AgeGroup1Amount: 1000,
        AgeGroup2Amount: 210.5,
        CurrencyCode: 'EUR',
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `substringof('acme', AccountName) and AccountId eq guid'${GUID}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'acme', '--account', GUID])

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

  it('fails with 64 on a bad limit before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--limit', 'ten']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer/)
  })
})
