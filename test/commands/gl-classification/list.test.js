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
import descriptor from '../../../src/lib/typed/descriptors/gl-classification.js'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-gl-classification-'),
)

const { default: Cmd } =
  await import('../../../src/commands/gl-classification/list.js')

const PATH = '/api/v1/123/financial/GLClassifications'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy
const PARENT = '11111111-2222-3333-4444-555555555555'
const NAMESPACE = '66666666-7777-8888-9999-000000000000'

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

describe('gl-classification list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('gl-classification')
    expect(descriptor.resource).toBe('financial/GLClassifications')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('selects the descriptor columns, orders by code, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              Code: '70',
              Description: 'Turnover',
              Abstract: false,
              Parent: PARENT,
              ID: 'c1',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(ORDER).toBe('Code asc')
    expect(out).toEqual([
      {
        Code: '70',
        Description: 'Turnover',
        Abstract: false,
        Parent: PARENT,
        ID: 'c1',
      },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `substringof('turnover', Description) and Parent eq guid'${PARENT}' and TaxonomyNamespace eq guid'${NAMESPACE}' and Abstract eq false`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'turnover',
      '--parent',
      PARENT,
      '--namespace',
      NAMESPACE,
      '--abstract',
      'no',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('searches an exact code when the search value is digits', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `(Code eq '70' or Code eq '${'70'.padStart(18, ' ')}')`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', '70'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad boolean before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--abstract', 'maybe']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
