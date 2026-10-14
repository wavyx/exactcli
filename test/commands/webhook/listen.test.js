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
import { mockApi, runCmd } from '../../helpers.js'

const mocks = vi.hoisted(() => ({
  startTunnel: vi.fn(),
  startWebhookServer: vi.fn(),
  password: vi.fn(),
}))
vi.mock('../../../src/lib/ngrok.js', () => ({ startTunnel: mocks.startTunnel }))
vi.mock('../../../src/lib/webhooks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startWebhookServer: mocks.startWebhookServer,
}))
vi.mock('@inquirer/prompts', () => ({ password: mocks.password }))

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-webhook-listen-'))
const { default: Cmd } = await import('../../../src/commands/webhook/listen.js')

const SUBS = '/api/v1/123/webhooks/WebhookSubscriptions'
const SUB_A = '11111111-1111-1111-1111-111111111111'
const SUB_B = '22222222-2222-2222-2222-222222222222'
const DOMAIN = 'acme.ngrok-free.app'
const EVENT = { Topic: 'Accounts', Action: 'Update', Division: 123, Key: 'k' }

/** The fake server keeps its handlers so a test can play a notification. */
let handlers
let tunnelStop
let serverClose

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
  process.env.EXACTCLI_WEBHOOK_SECRET = 'env-secret'
  tunnelStop = vi.fn()
  serverClose = vi.fn(async () => {})
  mocks.startTunnel.mockReset()
  mocks.startTunnel.mockResolvedValue({
    url: `https://${DOMAIN}`,
    stop: tunnelStop,
  })
  mocks.startWebhookServer.mockReset()
  mocks.startWebhookServer.mockImplementation(async (options) => {
    handlers = options
    return { port: 43210, close: serverClose }
  })
  mocks.password.mockReset()
})
afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  delete process.env.EXACTCLI_WEBHOOK_SECRET
})

const exit = (err) => err.exitCode ?? err.oclif?.exit
const BASE = ['--ngrok-domain', DOMAIN, '--allow-writes']

/** The subscriptions answer; the first notification plays once they exist. */
function mockSubscribe(topic, id, { playEvent = false } = {}) {
  return mockApi()
    .post(SUBS, { Topic: topic, CallbackURL: `https://${DOMAIN}/callback` })
    .reply(201, () => {
      if (playEvent) setImmediate(() => handlers.onEvent(EVENT))
      return { d: { ID: id, Topic: topic } }
    })
}

describe('webhook listen', () => {
  it('subscribes, prints each verified notification as a JSON line, then unsubscribes', async () => {
    const scope = mockSubscribe('Accounts', SUB_A)
      .post(SUBS, { Topic: 'Items', CallbackURL: `https://${DOMAIN}/callback` })
      .reply(201, () => {
        setImmediate(() => handlers.onEvent(EVENT))
        return { d: { ID: SUB_B } }
      })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)
      .delete(`${SUBS}(guid'${SUB_B}')`)
      .reply(204)

    const out = await runCmd(Cmd, [
      '--topic',
      'Accounts',
      '--topic',
      'Items',
      '--max-events',
      '1',
      ...BASE,
    ])

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(out)).toEqual(EVENT)
    expect(mocks.startWebhookServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 9998,
        path: '/callback',
        secret: 'env-secret',
      }),
    )
    // The tunnel serves the port the server listens on.
    expect(mocks.startTunnel).toHaveBeenCalledWith({
      domain: DOMAIN,
      port: 43210,
    })
    expect(tunnelStop).toHaveBeenCalled()
    expect(serverClose).toHaveBeenCalled()
  })

  it('listens until a signal without --max-events', async () => {
    // A real signal would stop the test worker too: use a plain event name.
    const signals = Cmd.signals
    Cmd.signals = ['exactcli-test-stop']
    const scope = mockApi()
      .post(SUBS)
      .reply(201, () => {
        setImmediate(() => handlers.onEvent(EVENT))
        return { d: { ID: SUB_A } }
      })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)

    // Stop once the command says it listens.
    const write = process.stderr.write.bind(process.stderr)
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((t) => {
      if (String(t).startsWith('Listening')) {
        setImmediate(() => process.emit('exactcli-test-stop'))
      }
      return String(t).startsWith('Listening') || write(t)
    })
    let out
    try {
      out = await runCmd(Cmd, ['--topic', 'Accounts', ...BASE])
    } finally {
      Cmd.signals = signals
      spy.mockRestore()
    }

    expect(scope.isDone()).toBe(true)
    expect(JSON.parse(out)).toEqual(EVENT)
    expect(process.listenerCount('exactcli-test-stop')).toBe(0)
  })

  it('stops between two subscriptions on a signal and removes the first', async () => {
    const signals = Cmd.signals
    Cmd.signals = ['exactcli-test-early']
    const scope = mockApi()
      .post(SUBS)
      .reply(201, () => {
        process.emit('exactcli-test-early')
        return { d: { ID: SUB_A } }
      })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)
    const second = mockApi()
      .post(SUBS)
      .reply(201, { d: { ID: SUB_B } })

    try {
      await runCmd(Cmd, ['--topic', 'Accounts', '--topic', 'Items', ...BASE])
    } finally {
      Cmd.signals = signals
    }

    expect(scope.isDone()).toBe(true)
    expect(second.isDone()).toBe(false)
    expect(tunnelStop).toHaveBeenCalled()
    expect(process.listenerCount('exactcli-test-early')).toBe(0)
  })

  it('--keep leaves the subscriptions in place', async () => {
    const scope = mockSubscribe('Accounts', SUB_A, { playEvent: true })
    const del = mockApi().delete(/.*/).reply(204)

    await runCmd(Cmd, [
      '--topic',
      'Accounts',
      '--max-events',
      '1',
      '--keep',
      ...BASE,
    ])

    expect(scope.isDone()).toBe(true)
    expect(del.isDone()).toBe(false)
  })

  it('asks for the webhook secret when the environment has none', async () => {
    delete process.env.EXACTCLI_WEBHOOK_SECRET
    mocks.password.mockResolvedValue('typed-secret')
    mockSubscribe('Accounts', SUB_A, { playEvent: true })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)

    await runCmd(Cmd, ['--topic', 'Accounts', '--max-events', '1', ...BASE])

    expect(mocks.password).toHaveBeenCalled()
    expect(mocks.startWebhookServer).toHaveBeenCalledWith(
      expect.objectContaining({ secret: 'typed-secret' }),
    )
  })

  it('reports a refused notification on stderr and keeps listening', async () => {
    mockApi()
      .post(SUBS)
      .reply(201, () => {
        setImmediate(() => {
          handlers.onInvalid('bad signature')
          handlers.onEvent(EVENT)
        })
        return { d: { ID: SUB_A } }
      })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)

    let out
    try {
      out = await runCmd(Cmd, [
        '--topic',
        'Accounts',
        '--max-events',
        '1',
        ...BASE,
      ])
    } finally {
      spy.mockRestore()
    }

    expect(JSON.parse(out)).toEqual(EVENT)
    expect(chunks.join('')).toContain('Refused a notification: bad signature')
  })

  it('unsubscribes what it created and stops everything when a subscription fails', async () => {
    const scope = mockSubscribe('Accounts', SUB_A)
      .post(SUBS)
      .reply(500, { error: { message: { value: 'Data already exists' } } })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(204)

    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--topic',
      'Accounts',
      '--topic',
      'Items',
      '--no-retry',
      ...BASE,
    ]).catch((e) => e)

    expect(exit(err)).toBe(69)
    expect(err.message).toMatch(/Data already exists/)
    expect(scope.isDone()).toBe(true)
    expect(tunnelStop).toHaveBeenCalled()
    expect(serverClose).toHaveBeenCalled()
  })

  it('names the subscription it cannot remove', async () => {
    mockSubscribe('Accounts', SUB_A, { playEvent: true })
      .delete(`${SUBS}(guid'${SUB_A}')`)
      .reply(500, { error: { message: { value: 'Locked' } } })
    const chunks = []
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => chunks.push(args.join(' ')))

    try {
      await runCmd(Cmd, [
        '--topic',
        'Accounts',
        '--max-events',
        '1',
        '--no-retry',
        ...BASE,
      ])
    } finally {
      spy.mockRestore()
    }

    expect(chunks.join('')).toContain(SUB_A)
  })

  it('refuses without --allow-writes before it starts anything', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run([
      '--topic',
      'Accounts',
      '--ngrok-domain',
      DOMAIN,
    ]).catch((e) => e)

    expect(exit(err)).toBe(77)
    expect(mocks.startWebhookServer).not.toHaveBeenCalled()
    expect(mocks.startTunnel).not.toHaveBeenCalled()
  })

  it('fails without a division before it starts the server', async () => {
    delete process.env.EXACTCLI_DIVISION
    process.stdout.isTTY = true
    try {
      const err = await Cmd.run(['--topic', 'Accounts', ...BASE]).catch(
        (e) => e,
      )
      expect(exit(err)).toBe(78)
    } finally {
      process.env.EXACTCLI_DIVISION = '123'
    }
    expect(mocks.startWebhookServer).not.toHaveBeenCalled()
  })

  it('refuses an empty webhook secret with 78 before it starts the server', async () => {
    delete process.env.EXACTCLI_WEBHOOK_SECRET
    mocks.password.mockResolvedValue('  ')
    process.stdout.isTTY = true

    const err = await Cmd.run(['--topic', 'Accounts', ...BASE]).catch((e) => e)

    expect(exit(err)).toBe(78)
    expect(err.message).toBe('The webhook secret is empty')
    expect(mocks.startWebhookServer).not.toHaveBeenCalled()
  })

  it('fails with 78 without an ngrok domain', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['--topic', 'Accounts', '--allow-writes']).catch(
      (e) => e,
    )

    expect(exit(err)).toBe(78)
    expect(err.message).toMatch(/ngrok domain/)
  })
})
