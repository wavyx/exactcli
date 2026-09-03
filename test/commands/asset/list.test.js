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
import descriptor from '../../../src/lib/typed/descriptors/asset.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-asset-'))

const { default: Cmd } = await import('../../../src/commands/asset/list.js')

const PATH = '/api/v1/123/assets/Assets'
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

describe('asset list', () => {
  it('is the typed command of a descriptor that the catalogue validates', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('asset')
    expect(descriptor.resource).toBe('assets/Assets')
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
              Code: 'A001',
              Description: 'Laptop',
              AssetGroupDescription: 'Hardware',
              StartDate: '/Date(1723990800000)/',
              InvestmentAmountDC: 1200,
              ResidualValue: 100,
              Status: 1,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Code: 'A001',
        Description: 'Laptop',
        AssetGroupDescription: 'Hardware',
        StartDate: '2024-08-18T14:20:00',
        InvestmentAmountDC: 1200,
        ResidualValue: 100,
        Status: 1,
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
          "substringof('laptop', Description) and Status eq 1" +
          " and StartDate ge datetime'2026-01-01'" +
          " and StartDate le datetime'2026-12-31'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'laptop',
      '--status',
      '1',
      '--from',
      '2026-01-01',
      '--to',
      '2026-12-31',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('rejects a non-integer --status with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--status', 'active']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received active/)
    expect(scope.isDone()).toBe(false)
  })

  it('rejects a bad --to date with exit 64 before any request', async () => {
    const scope = mockApi()
      .get(PATH)
      .query(true)
      .reply(200, { d: { results: [] } })

    process.stdout.isTTY = true
    const err = await Cmd.run(['--to', '31/12/2026']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received 31\/12\/2026/)
    expect(scope.isDone()).toBe(false)
  })
})
