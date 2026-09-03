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
import descriptor from '../../../src/lib/typed/descriptors/item.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-item-'))

const { default: Cmd } = await import('../../../src/commands/item/list.js')

const PATH = '/api/v1/123/logistics/Items'
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

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('item list', () => {
  it('is the typed command of a descriptor the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by default, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Code: 'WIDGET',
              Description: 'Widget',
              IsSalesItem: true,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { Code: 'WIDGET', Description: 'Widget', IsSalesItem: true },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('widget', Description) and IsSalesItem eq true and IsPurchaseItem eq false and IsStockItem eq true",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'widget',
      '--sales',
      'yes',
      '--purchase',
      'no',
      '--stock',
      'true',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('searches a numeric value as an exact Code', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `(Code eq '1001' or Code eq '${'1001'.padStart(18, ' ')}')`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', '1001'])

    expect(scope.isDone()).toBe(true)
  })

  it('exits 64 on a bad boolean before any request', async () => {
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await fail(['--sales', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toContain('Expected true or false')
    expect(scope.isDone()).toBe(false)
  })
})
