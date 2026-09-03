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
import descriptor from '../../../src/lib/typed/descriptors/project.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-project-'))

const { default: Cmd } = await import('../../../src/commands/project/list.js')

const PATH = '/api/v1/123/project/Projects'
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

describe('project list', () => {
  it('is the typed command of a descriptor that the catalogue validates', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('project')
    expect(descriptor.resource).toBe('project/Projects')
    expect(descriptor.orderBy).toBe('Code asc')
    expect(descriptor.columns.at(-1)).toBe('ID')
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: 'Code asc' })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Code: 'P001',
              Description: 'Website',
              AccountName: 'Acme',
              Type: 1,
              StartDate: '/Date(1723990800000)/',
              BudgetedAmount: 5000,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Code: 'P001',
        Description: 'Website',
        AccountName: 'Acme',
        Type: 1,
        StartDate: '2024-08-18T14:20:00',
        BudgetedAmount: 5000,
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
          `Account eq guid'${GUID}' and substringof('web', Description)` +
          " and Type eq 1 and StartDate ge datetime'2026-01-01'" +
          " and StartDate le datetime'2026-12-31'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--account',
      '1001',
      '--search',
      'web',
      '--type',
      '1',
      '--from',
      '2026-01-01',
      '--to',
      '2026-12-31',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('rejects a non-integer --type with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--type', 'fixed']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received fixed/)
    expect(scope.isDone()).toBe(false)
  })

  it('rejects a bad --from date with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--from', 'yesterday']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received yesterday/)
    expect(scope.isDone()).toBe(false)
  })
})
