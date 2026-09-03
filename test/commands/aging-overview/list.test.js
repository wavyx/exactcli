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
import descriptor from '../../../src/lib/typed/descriptors/aging-overview.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-aging-overview-'))

const { default: Cmd } =
  await import('../../../src/commands/aging-overview/list.js')

const PATH = '/api/v1/123/read/financial/AgingOverview'
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

describe('aging-overview list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('aging-overview')
    expect(descriptor.resource).toBe('read/financial/AgingOverview')
    expect(descriptor.orderBy).toBe('AgeGroup asc')
    expect(descriptor.columns).toEqual([
      'AgeGroupDescription',
      'AmountReceivable',
      'AmountPayable',
      'CurrencyCode',
      'AgeGroup',
    ])
  })

  it('selects the descriptor columns, orders by age group, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              AgeGroupDescription: '0 - 30 days',
              AmountReceivable: 1500,
              AmountPayable: 250.5,
              CurrencyCode: 'EUR',
              AgeGroup: 1,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        AgeGroupDescription: '0 - 30 days',
        AmountReceivable: 1500,
        AmountPayable: 250.5,
        CurrencyCode: 'EUR',
        AgeGroup: 1,
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "AgeGroup eq 2 and CurrencyCode eq 'EUR'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--age-group', '2', '--currency', 'EUR'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad age group before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--age-group', 'old']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received old/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
