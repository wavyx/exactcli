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
import descriptor from '../../../src/lib/typed/descriptors/journal.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-journal-'))

const { default: Cmd } = await import('../../../src/commands/journal/list.js')

const PATH = '/api/v1/123/financial/Journals'
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

describe('journal list', () => {
  it('is the typed command of a descriptor that the catalogue accepts', () => {
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
              Code: '70',
              Description: 'Sales',
              Type: 20,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([{ Code: '70', Description: 'Sales', Type: 20 }])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "substringof('bank', Description) and Type eq 12",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'bank', '--type', '12'])

    expect(scope.isDone()).toBe(true)
  })

  it('searches an exact code when the search is digits', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "(Code eq '700' or Code eq '               700')",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', '700'])

    expect(scope.isDone()).toBe(true)
  })

  it('exits 64 on a type that is not an integer, before any request', async () => {
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await Cmd.run(['--type', 'bank']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(scope.isDone()).toBe(false)
  })
})
