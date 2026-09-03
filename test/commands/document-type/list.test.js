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
  validateDescriptor,
} from '../../../src/lib/catalog.js'
import descriptor from '../../../src/lib/typed/descriptors/document-type.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-document-type-'))

const { default: Cmd } =
  await import('../../../src/commands/document-type/list.js')

const PATH = '/api/v1/123/documents/DocumentTypes'
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

describe('document-type list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('document-type')
    expect(descriptor.resource).toBe('documents/DocumentTypes')
    expect(() => validateDescriptor(descriptor)).not.toThrow()
  })

  it('lists a resource with a plain integer key', () => {
    expect(keyType(findResource(descriptor.resource))).toBe('plain')
    expect(descriptor.columns.at(-1)).toBe('ID')
  })

  it('selects the descriptor columns, orders by ID, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              ID: 10,
              Description: 'Sales invoice',
              DocumentIsCreatable: true,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(ORDER).toBe('ID asc')
    expect(out).toEqual([
      { ID: 10, Description: 'Sales invoice', DocumentIsCreatable: true },
    ])
  })

  it('renders its typed filters', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('invoice', Description) and DocumentIsCreatable eq true and TypeCategory eq 1",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'invoice',
      '--creatable',
      'yes',
      '--category',
      '1',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad integer before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--category', 'sales']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received sales/)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('fails with 64 on a bad boolean before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--creatable', 'maybe']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })
})
