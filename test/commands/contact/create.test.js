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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-contact-create-'))

const { default: Cmd } = await import('../../../src/commands/contact/create.js')

const ACCOUNT = '11111111-1111-1111-1111-111111111111'
const CONTACT = '22222222-2222-2222-2222-222222222222'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const CONTACTS = '/api/v1/123/crm/Contacts'
const BASE = ['--account', '1001', '--first-name', 'Jane', '--last-name', 'Doe']

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

/** The account lookup by code. */
const mockLookup = () =>
  mockApi()
    .get(ACCOUNTS)
    .query({ $filter: "Code eq '1001'", $select: 'ID,Code,Name', $top: '2' })
    .reply(200, { d: { results: [{ ID: ACCOUNT }] } })

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

describe('contact create', () => {
  it('--dry-run resolves the account and sends no POST', async () => {
    const lookup = mockLookup()
    const post = mockApi().post(CONTACTS).reply(201, { d: {} })

    const out = JSON.parse(await runCmd(Cmd, [...BASE, '--dry-run']))

    expect(lookup.isDone()).toBe(true)
    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: CONTACTS,
      body: { Account: ACCOUNT, FirstName: 'Jane', LastName: 'Doe' },
    })
  })

  it('refuses without --allow-writes before the lookup', async () => {
    const lookup = mockLookup()

    const err = await fail(BASE)

    expect(exit(err)).toBe(77)
    expect(lookup.isDone()).toBe(false)
  })

  it('POSTs every flag as its field with --allow-writes and prints the record', async () => {
    const scope = mockLookup()
      .post(CONTACTS, {
        Account: ACCOUNT,
        FirstName: 'Jane',
        LastName: 'Doe',
        Email: 'jane@acme.example',
        BusinessPhone: '+32 2 123 45 67',
        Mobile: '+32 470 12 34 56',
        JobTitleDescription: 'CFO',
        IsMainContact: true,
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID: CONTACT,
          FullName: 'Jane Doe',
          Email: 'jane@acme.example',
          Notes: null,
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--email',
        'jane@acme.example',
        '--phone',
        '+32 2 123 45 67',
        '--mobile',
        '+32 470 12 34 56',
        '--job-title',
        'CFO',
        '--main',
        'yes',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID: CONTACT,
      FullName: 'Jane Doe',
      Email: 'jane@acme.example',
      Notes: null,
    })
  })

  it('passes a GUID account through without a lookup', async () => {
    const out = JSON.parse(
      await runCmd(Cmd, [
        '--account',
        ACCOUNT,
        '--first-name',
        'Jane',
        '--last-name',
        'Doe',
        '--dry-run',
      ]),
    )

    expect(out.body).toEqual({
      Account: ACCOUNT,
      FirstName: 'Jane',
      LastName: 'Doe',
    })
  })

  it('fails with 64 on a bad --main value, before the gate', async () => {
    const err = await fail([...BASE, '--main', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })

  it('fails with 64 without --account', async () => {
    const err = await fail([
      '--first-name',
      'Jane',
      '--last-name',
      'Doe',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag account/)
  })
})
