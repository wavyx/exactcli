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
import descriptor from '../../../src/lib/typed/descriptors/vat-code.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-vat-code-'))

const { default: Cmd } = await import('../../../src/commands/vat-code/list.js')

const PATH = '/api/v1/123/vat/VATCodes'
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

describe('vat-code list', () => {
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
              Code: '21',
              Description: 'VAT 21%',
              Percentage: 0.21,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { Code: '21', Description: 'VAT 21%', Percentage: 0.21 },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('intra', Description) and Type eq 'E' and IsBlocked eq false",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'intra', '--type', 'E', '--blocked', 'no'])

    expect(scope.isDone()).toBe(true)
  })

  it('exits 64 on a blocked value that is not a boolean, before any request', async () => {
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await Cmd.run(['--blocked', 'maybe']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(scope.isDone()).toBe(false)
  })
})
