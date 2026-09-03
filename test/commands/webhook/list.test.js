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
import descriptor from '../../../src/lib/typed/descriptors/webhook.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-webhook-'))

const { default: Cmd } = await import('../../../src/commands/webhook/list.js')

const PATH = '/api/v1/123/webhooks/WebhookSubscriptions'
const GUID = '11111111-1111-1111-1111-111111111111'
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

describe('webhook list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('webhook')
    expect(descriptor.resource).toBe('webhooks/WebhookSubscriptions')
    expect(descriptor.orderBy).toBe('Topic asc')
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
              Topic: 'Accounts',
              CallbackURL: 'https://hooks.acme.example/exact',
              Description: 'Acme sync',
              Created: '/Date(1723990800000)/',
              ID: GUID,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Topic: 'Accounts',
        CallbackURL: 'https://hooks.acme.example/exact',
        Description: 'Acme sync',
        Created: '2024-08-18T14:20:00',
        ID: GUID,
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
          "Topic eq 'Accounts' and substringof('acme', Description) and IsInstant eq false",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--topic',
      'Accounts',
      '--search',
      'acme',
      '--instant',
      'no',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad boolean before any request', async () => {
    process.stdout.isTTY = true
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await Cmd.run(['--instant', 'maybe']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
    expect(scope.isDone()).toBe(false)
  })
})
