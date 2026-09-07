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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-webhook-update-'))

const { default: Cmd } = await import('../../../src/commands/webhook/update.js')

const GUID = '11111111-1111-1111-1111-111111111111'
const WEBHOOKS = '/api/v1/123/webhooks/WebhookSubscriptions'
const KEYED = `${WEBHOOKS}(guid'${GUID}')`
const URL = 'https://acme.example/hooks/exact-v2'

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

describe('webhook update', () => {
  it('--dry-run prints only the given fields and sends no PUT', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const out = JSON.parse(await runCmd(Cmd, [GUID, '--url', URL, '--dry-run']))

    expect(put.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'PUT',
      path: KEYED,
      body: { CallbackURL: URL },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const put = mockApi().put(KEYED).reply(204)

    const err = await fail([GUID, '--url', URL])

    expect(exit(err)).toBe(77)
    expect(put.isDone()).toBe(false)
  })

  it('PUTs the given fields to the keyed path and reports the fields', async () => {
    const scope = mockApi()
      .put(KEYED, { CallbackURL: URL, Description: 'Production hook' })
      .reply(204)

    const out = JSON.parse(
      await runCmd(Cmd, [
        GUID,
        '--url',
        URL,
        '--description',
        'Production hook',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ok: true,
      path: KEYED,
      key: GUID,
      fields: ['CallbackURL', 'Description'],
    })
  })

  it('prints a human line in a terminal', async () => {
    mockApi().put(KEYED, { Description: 'Staging hook' }).reply(204)
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      GUID,
      '--description',
      'Staging hook',
      '--allow-writes',
    ])

    expect(out).toBe(
      `Updated webhooks/WebhookSubscriptions ${GUID}: Description`,
    )
  })

  it('fails with 64 when no field is given', async () => {
    const err = await fail([GUID, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Nothing to update/)
  })

  it('fails with 64 on a --url that is not https, before the gate', async () => {
    const err = await fail([GUID, '--url', 'http://acme.example/hooks'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--url must start with https:\/\//)
  })

  it('fails with 64 on an id that is not a GUID', async () => {
    const err = await fail(['700', '--url', URL])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('has no --topic flag: the topic of a subscription is fixed', async () => {
    const err = await fail([GUID, '--topic', 'Accounts', '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--topic/)
  })
})
