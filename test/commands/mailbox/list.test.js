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
import descriptor from '../../../src/lib/typed/descriptors/mailbox.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-mailbox-'))

const { default: Cmd } = await import('../../../src/commands/mailbox/list.js')

const PATH = '/api/v1/123/mailbox/Mailboxes'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
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

describe('mailbox list', () => {
  it('is the typed command of a descriptor that validates against the catalogue', () => {
    resetCatalog()
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('mailbox')
    expect(descriptor.resource).toBe('mailbox/Mailboxes')
    expect(descriptor.orderBy).toBe('Mailbox asc')
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
              Mailbox: '123456@exactonline.be',
              Description: 'Digital postbox',
              Type: 1,
              ValidFrom: '/Date(1723990800000)/',
              ValidTo: null,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        Mailbox: '123456@exactonline.be',
        Description: 'Digital postbox',
        Type: 1,
        ValidFrom: '2024-08-18T14:20:00',
        ValidTo: null,
      },
    ])
  })

  it('renders its typed filters, resolves the account code', async () => {
    const lookup = mockApi()
      .get(ACCOUNTS)
      .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
      .reply(200, { d: { results: [{ ID: GUID }] } })
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter:
          "substringof('postbox', Description)" +
          ` and Account eq guid'${GUID}' and Type eq 1`,
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--search',
      'postbox',
      '--account',
      '1001',
      '--type',
      '1',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('searches the description even for digits: a mailbox has no Code', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({
        $select: SELECT,
        $orderby: ORDER,
        $filter: "substringof('123', Description)",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, ['--search', '123'])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad type before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--type', 'exact']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received exact/)
  })
})
