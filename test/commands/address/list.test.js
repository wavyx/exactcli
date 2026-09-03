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
import descriptor from '../../../src/lib/typed/descriptors/address.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-address-'))

const { default: Cmd } = await import('../../../src/commands/address/list.js')

const PATH = '/api/v1/123/crm/Addresses'
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

describe('address list', () => {
  it('is the typed command of a descriptor that the catalogue knows', () => {
    expect(() => validateDescriptor(descriptor)).not.toThrow()
    expect(Cmd.descriptor).toBe(descriptor)
    expect(descriptor.topic).toBe('address')
    expect(descriptor.resource).toBe('crm/Addresses')
    expect(descriptor.orderBy).toBe('AccountName asc')
    expect(descriptor.columns.at(-1)).toBe('ID')
  })

  it('selects the descriptor columns, orders by account name, normalizes rows', async () => {
    const scope = mockApi()
      .get(PATH)
      .query({ $select: SELECT, $orderby: ORDER })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              AccountName: 'Acme',
              Type: 3,
              AddressLine1: 'Main Street 1',
              Postcode: '1000',
              City: 'Brussels',
              Country: 'BE',
              Main: true,
            },
          ],
        },
      })

    const out = JSON.parse(await runCmd(Cmd, []))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      {
        AccountName: 'Acme',
        Type: 3,
        AddressLine1: 'Main Street 1',
        Postcode: '1000',
        City: 'Brussels',
        Country: 'BE',
        Main: true,
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
          `Account eq guid'${GUID}' and Type eq 3` +
          " and City eq 'Brussels' and Main eq true",
      })
      .reply(200, { d: { results: [] } })

    await runCmd(Cmd, [
      '--account',
      '1001',
      '--type',
      '3',
      '--city',
      'Brussels',
      '--main',
      'yes',
    ])

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on a bad type before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--type', 'invoice']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected an integer, received invoice/)
    expect(nock.pendingMocks()).toEqual([])
  })

  it('fails with 64 on a bad boolean before any request', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--main', 'maybe']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
    expect(nock.pendingMocks()).toEqual([])
  })
})
