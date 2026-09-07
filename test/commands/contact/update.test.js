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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-contact-update-'))

const { default: Cmd } = await import('../../../src/commands/contact/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const CONTACTS = '/api/v1/123/crm/Contacts'
const KEYED = `${CONTACTS}(guid'${GUID}')`

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

describe('contact update', () => {
  it('--dry-run prints only the given fields and sends no PUT', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--email',
        'jane@acme.example',
        '--main',
        'yes',
        '--dry-run',
      ]),
    )

    expect(put.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { Email: 'jane@acme.example', IsMainContact: true },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const err = await fail([GUID, '--email', 'jane@acme.example'])

    expect(exit(err)).toBe(77)
    expect(put.isDone()).toBe(false)
  })

  it('PUTs only the given fields to the keyed path and reports the fields', async () => {
    const scope = mockApi()
      .put(KEYED, { FirstName: 'Jane', Mobile: '+32 470 12 34 56' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--first-name',
        'Jane',
        '--mobile',
        '+32 470 12 34 56',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: KEYED,
      key: GUID,
      fields: ['FirstName', 'Mobile'],
    })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().put(KEYED, { LastName: 'Doe' }).reply(204)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      GUID,
      '--last-name',
      'Doe',
      '--allow-writes',
    ])

    expect(out).toBe(`Updated crm/Contacts ${GUID}: LastName`)
  })

  it('fails with 64 when no field is given', async () => {
    const err = await fail([GUID, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Nothing to update/)
  })

  it('fails with 64 on a bad --main value, before the gate', async () => {
    const err = await fail([GUID, '--main', 'maybe'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Expected true or false, received maybe/)
  })

  it('fails with 64 on an id that is not a GUID: a contact has no code', async () => {
    const err = await fail(['1001', '--email', 'jane@acme.example'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('has no --account flag', async () => {
    const err = await fail([GUID, '--account', '1001', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--account/)
  })
})
