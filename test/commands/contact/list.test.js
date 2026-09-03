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
import descriptor from '../../../src/lib/typed/descriptors/contact.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-contact-'))

const { default: Cmd } = await import('../../../src/commands/contact/list.js')

const PATH = '/api/v1/123/crm/Contacts'
const SELECT = descriptor.columns.join(',')
const ORDER = descriptor.orderBy
const GUID = '11111111-1111-1111-1111-111111111111'

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

describe('contact list', () => {
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
              FullName: 'Jane Doe',
              AccountName: 'Acme',
              Modified: '/Date(1723990800000)/',
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        FullName: 'Jane Doe',
        AccountName: 'Acme',
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
        $filter: `substringof('jane', FullName) and Account eq guid'${GUID}' and Email eq 'jane@acme.example' and Modified ge datetime'2026-01-01'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'jane',
      '--account',
      GUID,
      '--email',
      'jane@acme.example',
      '--since',
      '2026-01-01',
    ])

    expect(scope.isDone()).toBe(true)
  })

  it('resolves an --account code through crm/Accounts', async () => {
    const scope = mockApi()
      .get('/api/v1/123/crm/Accounts')
      .query({ $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: `Account eq guid'${GUID}'`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--account', 'ACME'])

    expect(scope.isDone()).toBe(true)
  })

  it('exits 64 on a bad date before any request', async () => {
    const scope = mockApi().get(PATH).query(true).reply(200, {})

    const err = await fail(['--since', '2026-1-1'])

    expect(exit(err)).toBe(64)
    expect(err.message).toContain('Expected YYYY-MM-DD')
    expect(scope.isDone()).toBe(false)
  })
})
