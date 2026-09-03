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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-webhook-create-'))

const { default: Cmd } = await import('../../../src/commands/webhook/create.js')

const ID = '11111111-1111-1111-1111-111111111111'
const WEBHOOKS = '/api/v1/123/webhooks/WebhookSubscriptions'
const URL = 'https://acme.example/hooks/exact'
const BASE = ['--topic', 'Accounts', '--url', URL]

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

describe('webhook create', () => {
  it('--dry-run prints the request and sends no POST', async () => {
    const post = mockApi().post(WEBHOOKS).reply(201, { d: {} })

    const out = JSON.parse(await runCmd(Cmd, [...BASE, '--dry-run']))

    expect(post.isDone()).toBe(false)
    expect(out).toEqual({
      method: 'POST',
      path: WEBHOOKS,
      body: { Topic: 'Accounts', CallbackURL: URL },
    })
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const post = mockApi().post(WEBHOOKS).reply(201, { d: {} })

    const err = await fail(BASE)

    expect(exit(err)).toBe(77)
    expect(post.isDone()).toBe(false)
  })

  it('POSTs the subscription with --allow-writes and prints the record', async () => {
    const scope = mockApi()
      .post(WEBHOOKS, {
        Topic: 'SalesInvoices',
        CallbackURL: URL,
        Description: 'Acme sync',
      })
      .reply(201, {
        d: {
          __metadata: { uri: 'x' },
          ID,
          Topic: 'SalesInvoices',
          CallbackURL: URL,
          Description: 'Acme sync',
          Created: '/Date(1756857600000)/',
        },
      })

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--topic',
        'SalesInvoices',
        '--url',
        URL,
        '--description',
        'Acme sync',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      ID,
      Topic: 'SalesInvoices',
      CallbackURL: URL,
      Description: 'Acme sync',
      Created: '2025-09-03T00:00:00',
    })
  })

  it('fails with 64 on a URL that is not https, before the gate', async () => {
    const err = await fail([
      '--topic',
      'Accounts',
      '--url',
      'http://acme.example/hooks/exact',
      '--allow-writes',
    ])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--url must start with https:\/\//)
  })

  it('fails with 64 without --topic', async () => {
    const err = await fail(['--url', URL, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/Missing required flag topic/)
  })
})
