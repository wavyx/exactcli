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
import descriptor from '../../../src/lib/typed/descriptors/cost-center.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-cost-center-'))

const { default: Cmd } =
  await import('../../../src/commands/cost-center/list.js')

const PATH = '/api/v1/123/hrm/Costcenters'
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

describe('cost-center list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('cost-center')
    expect(descriptor.resource).toBe('hrm/Costcenters')
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
              Code: '100',
              Description: 'Sales',
              Active: true,
              EndDate: '/Date(1723990800000)/',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Code: '100',
        Description: 'Sales',
        Active: true,
        EndDate: '2024-08-18T14:20:00',
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "substringof('sales', Description) and Active eq true",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', 'sales', '--active', 'yes'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad active flag before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--active', 'maybe']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })
})
