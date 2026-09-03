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
import descriptor from '../../../src/lib/typed/descriptors/item-group.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-item-group-'))

const { default: Cmd } =
  await import('../../../src/commands/item-group/list.js')

const PATH = '/api/v1/123/logistics/ItemGroups'
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

describe('item-group list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('item-group')
    expect(descriptor.resource).toBe('logistics/ItemGroups')
    expect(descriptor.orderBy).toBe('Code asc')
    expect(descriptor.columns.at(-1)).toBe('ID')
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
              Code: 'PARTS',
              Description: 'Spare parts',
              GLRevenueCode: '700000',
              IsDefault: 1,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Code: 'PARTS',
        Description: 'Spare parts',
        GLRevenueCode: '700000',
        IsDefault: 1,
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "substringof('parts', Description) and IsDefault eq 1",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'parts', '--default', '1'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad default flag before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--default', 'yes']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received yes/)
  })
})
