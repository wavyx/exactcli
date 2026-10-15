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
import { mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-create-'))

const { default: Cmd } = await import('../../src/commands/create.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const LOOKUP = { $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' }

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

describe('create', () => {
  it('POSTs the --set fields and prints the created record', async () => {
    const scope = mockApi()
      .post(ACCOUNTS, { Name: 'Acme', Status: 'C', IsSales: true })
      .reply(201, { d: { __metadata: { uri: 'x' }, ID: GUID, Name: 'Acme' } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        '--set',
        'Name=Acme',
        '--set',
        'Status=C',
        '--set',
        'IsSales=true',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ID: GUID, Name: 'Acme' })
  })

  it('merges --set over --body and resolves @ref markers', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query(LOOKUP)
      .reply(200, { d: { results: [{ ID: GUID }] } })
      .post(ACCOUNTS, { Name: 'Acme', City: 'Brussels', Accountant: GUID })
      .reply(201, { d: { results: [{ ID: GUID }] } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        '--body',
        '{"Name":"Acme","City":"Namur"}',
        '--set',
        'City=Brussels',
        '--set',
        'Accountant=@ref:crm/Accounts:ACME',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ ID: GUID })
  })

  it('--dry-run prints the validated request and sends nothing, no flag needed', async () => {
    const scope = mockApi().post(ACCOUNTS).reply(201, { d: {} })

    const out = JSON.parse(
      await runCmd(Cmd, ['crm/Accounts', '--set', 'Name=Acme', '--dry-run']),
    )

    expect(out).toEqual({
      method: 'POST',
      path: ACCOUNTS,
      body: { Name: 'Acme' },
    })
    expect(scope.isDone()).toBe(false)
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query(LOOKUP)
      .reply(200, { d: { results: [{ ID: GUID }] } })

    const err = await fail([
      'crm/Accounts',
      '--set',
      'Name=Acme',
      '--set',
      'Accountant=@ref:crm/Accounts:ACME',
    ])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('fails with 64 on a body the catalogue rejects, before the gate', async () => {
    const err = await fail(['crm/Accounts', '--set', 'Nope=1'])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(
      /missing mandatory fields: Name; unknown fields: Nope/,
    )
  })

  it('sends to an unknown resource with --force', async () => {
    const scope = mockApi()
      .post('/api/v1/123/custom/Things', { A: 1 })
      .reply(201, { d: { A: 1 } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'custom/Things',
        '--set',
        'A=1',
        '--force',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ A: 1 })
  })

  it('validates a beta-only resource against its beta record', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        'cashflow/AllocationRule',
        '--set',
        'Words=ACME',
        '--beta',
        '--dry-run',
      ]),
    )
    expect(out.path).toBe('/api/v1/beta/123/cashflow/AllocationRule')
  })

  it('reads the beta namespace with --beta', async () => {
    const scope = mockApi()
      .post('/api/v1/beta/123/crm/Accounts', { Name: 'A' })
      .reply(201, { d: { Name: 'A' } })

    await runCmd(Cmd, [
      'crm/Accounts',
      '--set',
      'Name=A',
      '--beta',
      '--allow-writes',
    ])

    expect(scope.isDone()).toBe(true)
  })
})
