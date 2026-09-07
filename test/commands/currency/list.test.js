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
import {
  findResource,
  keyType,
  resetCatalog,
  validateDescriptor,
} from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/currency.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-currency-'))

const { default: Cmd } = await import('../../../src/commands/currency/list.js')

const PATH = '/api/v1/123/general/Currencies'
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

describe('currency list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('currency')
    expect(descriptor.resource).toBe('general/Currencies')
    expect(descriptor.orderBy).toBe('Code asc')
  })

  it('lists a resource with a string key, Code', () => {
    expect(keyType(findResource(descriptor.resource))).toBe('string')
    expect(descriptor.columns[0]).toBe('Code')
  })

  it('selects the descriptor columns, orders by Code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Code: 'EUR',
              Description: 'Euro',
              Created: '/Date(1723990800000)/',
              Modified: '/Date(1723990800000)/',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Code: 'EUR',
        Description: 'Euro',
        Created: '2024-08-18T14:20:00',
        Modified: '2024-08-18T14:20:00',
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
          "substringof('euro', Description) and Modified ge datetime'2026-01-01'",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'euro', '--since', '2026-01-01'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad date before any request', async () => {
    process.stdout.isTTY = true
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await Cmd.run(['--since', 'yesterday']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected YYYY-MM-DD, received yesterday/)
    expect(scope.isDone()).toBe(false)
  })
})
