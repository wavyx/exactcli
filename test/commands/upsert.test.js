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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-upsert-'))
const { default: Cmd } = await import('../../src/commands/upsert.js')

const ACCOUNTS = '/api/v1/123/crm/Accounts'
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

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

const exit = (err) => err.exitCode ?? err.oclif?.exit
const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
/** The lookup of the record, answered with these rows. */
const mockMatch = (rows) =>
  mockApi()
    .get(ACCOUNTS)
    .query(
      (q) =>
        q.$filter === "(Code eq '1001' or Code eq '              1001')" &&
        q.$top === '2',
    )
    .reply(200, { d: { results: rows } })

const ARGS = ['crm/Accounts', '--match', 'Code=1001', '--set', 'Name=Acme NV']

describe('upsert', () => {
  it('creates the record with the match fields when nothing matches', async () => {
    const scope = mockMatch([])
      .post(ACCOUNTS, { Name: 'Acme NV', Code: '1001' })
      .reply(201, { d: { __metadata: { uri: 'x' }, ID: A, Name: 'Acme NV' } })

    const out = JSON.parse(await runCmd(Cmd, [...ARGS, '--allow-writes']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ action: 'created', key: A })
  })

  it('updates the one match without the match fields', async () => {
    const scope = mockMatch([{ ID: A, Name: 'Acme', Code: '1001' }])
      .put(`${ACCOUNTS}(guid'${A}')`, { Name: 'Acme NV' })
      .reply(204)

    const out = JSON.parse(await runCmd(Cmd, [...ARGS, '--allow-writes']))

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ action: 'updated', key: A })
  })

  it('sends nothing when the match is all the body holds', async () => {
    const scope = mockMatch([{ ID: A, Name: 'Acme', Code: '1001' }])
    const put = mockApi().put(/.*/).reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        '--match',
        'Code=1001',
        '--set',
        'Code=1001',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(put.isDone()).toBe(false)
    expect(out).toEqual({ action: 'unchanged', key: A })
  })

  it('--dry-run prints the decision and the request', async () => {
    mockMatch([])
    let out = JSON.parse(await runCmd(Cmd, [...ARGS, '--dry-run']))
    expect(out).toEqual({
      action: 'create',
      request: {
        method: 'POST',
        path: ACCOUNTS,
        body: { Name: 'Acme NV', Code: '1001' },
      },
    })

    mockMatch([{ ID: A }])
    out = JSON.parse(await runCmd(Cmd, [...ARGS, '--dry-run']))
    expect(out).toEqual({
      action: 'update',
      key: A,
      request: {
        method: 'PUT',
        path: `${ACCOUNTS}(guid'${A}')`,
        body: { Name: 'Acme NV' },
      },
    })
  })

  it('checks the create body only when nothing matches', async () => {
    mockMatch([])

    const err = await fail([
      'crm/Accounts',
      '--match',
      'Code=1001',
      '--set',
      'Status=C',
      '--dry-run',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/missing mandatory fields: Name/)
  })

  it('creates on a resource without PUT, with the match typed by its field', async () => {
    const CONDITIONS = '/api/v1/123/cashflow/PaymentConditions'
    const scope = mockApi()
      .get(CONDITIONS)
      .query(
        (q) =>
          q.$filter === "Code eq 'A30' and PaymentDays eq 30" && q.$top === '2',
      )
      .reply(200, { d: { results: [] } })
      .post(CONDITIONS, {
        Description: '30 days',
        Code: 'A30',
        PaymentDays: 30,
      })
      .reply(201, { d: { ID: A } })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'cashflow/PaymentConditions',
        '--match',
        'Code=A30',
        '--match',
        'PaymentDays=30',
        '--set',
        'Description=30 days',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({ action: 'created', key: A })
  })

  it('refuses an unknown match field with 64 before any call', async () => {
    const err = await fail([
      'crm/Accounts',
      '--match',
      'Nope=1',
      '--set',
      'Name=Acme',
      '--dry-run',
    ])
    expect(exit(err)).toBe(64)
    expect(err.message).toBe('Nope is not a field of crm/Accounts')
  })

  it('refuses the update of a resource without PUT with 64', async () => {
    mockApi()
      .get('/api/v1/123/cashflow/PaymentConditions')
      .query(true)
      .reply(200, { d: { results: [{ ID: A }] } })

    const err = await fail([
      'cashflow/PaymentConditions',
      '--match',
      'Code=A30',
      '--set',
      'Description=30 days',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/method PUT not allowed/)
  })

  it('fails with 65 and names the matches when several records match', async () => {
    mockMatch([{ ID: A }, { ID: B }])

    const err = await fail([...ARGS, '--allow-writes'])

    expect(exit(err)).toBe(65)
    expect(err.message).toBe(
      `Several crm/Accounts match Code=1001: ${A}, ${B}. Add a --match`,
    )
  })

  it('refuses a write before the lookup, and a body the catalogue refuses', async () => {
    const lookup = mockMatch([])
    expect(exit(await fail(ARGS))).toBe(77)
    expect(lookup.isDone()).toBe(false)

    mockMatch([{ ID: A }])
    expect(
      exit(
        await fail([
          'crm/Accounts',
          '--match',
          'Code=1001',
          '--set',
          'Nope=1',
          '--dry-run',
        ]),
      ),
    ).toBe(64)
  })
})
