import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import nock from 'nock'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-lookup-'))
const { default: Cmd } = await import('../../src/commands/lookup.js')

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

describe('lookup', () => {
  it('prints the key, the label and the matched fields of every match', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query({
        $filter:
          "(Code eq '1001' or Code eq '              1001') and Status eq 'C'",
        $select: 'ID,Name,Code,Status',
      })
      .reply(200, {
        d: {
          results: [
            {
              __metadata: { uri: 'x' },
              ID: A,
              Name: 'Acme',
              Code: '              1001',
              Status: 'C',
            },
          ],
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        'crm/Accounts',
        '--match',
        'Code=1001',
        '--match',
        'Status=C',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual([
      { ID: A, Name: 'Acme', Code: '              1001', Status: 'C' },
    ])
  })

  it('--one prints the single match, and fails with 65 on none or several', async () => {
    const reply = (rows) =>
      mockApi()
        .get(ACCOUNTS)
        .query((q) => q.$top === '2')
        .reply(200, { d: { results: rows } })

    reply([{ ID: A, Name: 'Acme' }])
    expect(
      JSON.parse(
        await runCmd(Cmd, ['crm/Accounts', '--match', 'Name=Acme', '--one']),
      ),
    ).toEqual({ ID: A, Name: 'Acme' })

    reply([])
    let err = await fail(['crm/Accounts', '--match', 'Name=Acme', '--one'])
    expect(exit(err)).toBe(65)
    expect(err.message).toBe('No crm/Accounts matches Name=Acme')

    reply([
      { ID: A, Name: 'Acme' },
      { ID: B, Name: 'Acme' },
    ])
    err = await fail(['crm/Accounts', '--match', 'Name=Acme', '--one'])
    expect(exit(err)).toBe(65)
    expect(err.message).toBe(`Several crm/Accounts match Name=Acme: ${A}, ${B}`)
  })

  it('says on stderr when the matches fill more than one page', async () => {
    mockApi()
      .get(ACCOUNTS)
      .query(true)
      .reply(200, {
        d: { results: [{ ID: A, Name: 'Acme' }], __next: 'https://x' },
      })
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((c) => chunks.push(String(c)) > 0)
    try {
      await runCmd(Cmd, ['crm/Accounts', '--match', 'Name=Acme'])
    } finally {
      spy.mockRestore()
    }
    expect(chunks.join('')).toBe('More matches than one page: add a --match.\n')
  })

  it('selects the key and the matched fields where the resource has no label', async () => {
    const scope = mockApi()
      .get('/api/v1/123/activities/Complaints')
      .query({ $filter: "Account eq guid'" + A + "'", $select: 'ID,Account' })
      .reply(200, { d: { results: [{ ID: B, Account: A }] } })

    await runCmd(Cmd, ['activities/Complaints', '--match', `Account=${A}`])

    expect(scope.isDone()).toBe(true)
  })

  it('fails with 64 on an unknown resource or field', async () => {
    expect(exit(await fail(['crm/Nope', '--match', 'Name=x']))).toBe(64)
    expect(exit(await fail(['crm/Accounts', '--match', 'Nope=x']))).toBe(64)
  })
})
