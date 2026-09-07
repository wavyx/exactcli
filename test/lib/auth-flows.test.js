import { createServer } from 'node:net'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import { authorizationCodeFlow, manualCodeFlow } from '../../src/lib/auth.js'
import { HOST, mockApi, mockTokenExchange } from '../helpers.js'

const { prompts, http } = vi.hoisted(() => ({
  prompts: { input: vi.fn(async () => 'prompted-code') },
  http: { servers: [] },
}))

vi.mock('@inquirer/prompts', () => prompts)

// Keep every loopback server the flow creates, so a test can drive an event
// that only the server itself can emit.
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createServer: (...args) => {
      const server = actual.createServer(...args)
      http.servers.push(server)
      return server
    },
  }
})

const TOKEN_PATH = '/api/oauth2/token'
const SECRET = 'super-secret'
const REDIRECT = 'https://acme.example/callback'
const DEFAULT_PORT = 9999

/** A port that nothing listens on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** Occupy a port, so a listen on it fails. */
function occupy(port) {
  return new Promise((resolve, reject) => {
    const blocker = createServer()
    blocker.on('error', reject)
    blocker.listen(port, '127.0.0.1', () =>
      resolve(() => new Promise((done) => blocker.close(done))),
    )
  })
}

/**
 * Start the loopback flow and wait until it listens.
 * `outcome` settles with the token set or with the thrown error, so no
 * rejection stays unhandled while the test drives the callback.
 */
async function startFlow(overrides = {}) {
  const port = await freePort()
  let ready
  const listening = new Promise((resolve) => {
    ready = resolve
  })
  const promise = authorizationCodeFlow({
    host: HOST,
    clientId: 'cid',
    clientSecret: SECRET,
    redirectUri: REDIRECT,
    port,
    timeout: 5000,
    onReady: ready,
    ...overrides,
  })
  const outcome = promise.then(
    (tokens) => tokens,
    (err) => err,
  )
  const url = new URL(await listening)
  const callback = (query) =>
    fetch(`http://127.0.0.1:${port}/callback?${query}`)
  return { outcome, url, port, callback, server: http.servers.at(-1) }
}

beforeEach(() => {
  nock.cleanAll()
  nock.disableNetConnect()
  nock.enableNetConnect('127.0.0.1')
  prompts.input.mockClear().mockResolvedValue('prompted-code')
  http.servers.length = 0
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
  vi.restoreAllMocks()
})

describe('authorizationCodeFlow', () => {
  it('announces the authorization URL once it listens', async () => {
    const { outcome, url, callback } = await startFlow({ state: 'st4te' })
    mockTokenExchange()

    expect(url.origin).toBe(`https://${HOST}`)
    expect(url.pathname).toBe('/api/oauth2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(url.searchParams.get('state')).toBe('st4te')

    await callback('code=c1&state=st4te')
    await outcome
  })

  it('forces the login form when asked', async () => {
    const { outcome, url, callback } = await startFlow({
      state: 'st4te',
      forceLogin: true,
    })
    mockTokenExchange()

    expect(url.searchParams.get('force_login')).toBe('1')

    await callback('code=c1&state=st4te')
    await outcome
  })

  it('exchanges the code and resolves the token set', async () => {
    const { outcome, callback } = await startFlow({ state: 'st4te' })
    const { scope, captured } = mockTokenExchange()

    const res = await callback('code=the-code&state=st4te')
    const page = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(page).toMatch(/Authenticated\. You can close this window\./)
    expect(await outcome).toEqual({
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresIn: 600,
    })
    expect(scope.isDone()).toBe(true)
    expect(captured).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: REDIRECT,
      client_id: 'cid',
      client_secret: SECRET,
    })
  })

  it('never decodes the callback code twice', async () => {
    // The query parser already decoded it. A second decode would throw on a
    // code that ends in a literal percent sign.
    const { outcome, callback } = await startFlow({ state: 's' })
    const { captured } = mockTokenExchange()

    await callback('code=100%25pure&state=s')
    await outcome

    expect(captured.code).toBe('100%pure')
  })

  it('closes the loopback server once the login succeeded', async () => {
    const { outcome, callback, port } = await startFlow({ state: 's' })
    mockTokenExchange()

    await callback('code=c&state=s')
    await outcome

    await expect(fetch(`http://127.0.0.1:${port}/callback`)).rejects.toThrow()
  })

  it('generates a state when the caller passes none', async () => {
    const { outcome, url, callback } = await startFlow()
    mockTokenExchange()

    const state = url.searchParams.get('state')
    expect(state).toMatch(/^[0-9a-f]{32}$/)

    await callback(`code=c&state=${state}`)
    expect((await outcome).accessToken).toBe('acc')
  })

  it('answers 400 on a callback without state and keeps listening', async () => {
    const { outcome, callback } = await startFlow({ state: 'st4te' })
    mockTokenExchange()

    const res = await callback('code=c')
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/State mismatch/)

    await callback('code=c&state=st4te')
    expect((await outcome).accessToken).toBe('acc')
  })

  it('answers 400 on a state mismatch and keeps listening', async () => {
    const { outcome, callback } = await startFlow({ state: 'st4te' })
    mockTokenExchange()

    const res = await callback('code=c&state=wrong')
    const page = await res.text()

    expect(res.status).toBe(400)
    expect(page).toMatch(/State mismatch/)
    expect(page).not.toMatch(/wrong/)

    await callback('code=c&state=st4te')
    expect((await outcome).accessToken).toBe('acc')
  })

  it('answers 400 without a code and keeps listening', async () => {
    const { outcome, callback } = await startFlow({ state: 'st4te' })
    mockTokenExchange()

    const res = await callback('state=st4te')

    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/No authorization code/)

    await callback('code=c&state=st4te')
    expect((await outcome).accessToken).toBe('acc')
  })

  it('answers 404 on another path and on another method', async () => {
    const { outcome, callback, port } = await startFlow({ state: 's' })
    mockTokenExchange()

    const other = await fetch(`http://127.0.0.1:${port}/elsewhere`)
    expect(other.status).toBe(404)

    const posted = await fetch(`http://127.0.0.1:${port}/callback?code=c`, {
      method: 'POST',
    })
    expect(posted.status).toBe(404)

    await callback('code=c&state=s')
    expect((await outcome).accessToken).toBe('acc')
  })

  it('rejects with 77 when the callback carries an error', async () => {
    const { outcome, callback } = await startFlow({ state: 's' })

    const res = await callback('error=access_denied&state=s')
    const page = await res.text()
    const err = await outcome

    expect(res.status).toBe(400)
    expect(page).toMatch(/Authorization failed/)
    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/access_denied/)
  })

  it('never reflects the error query into the page', async () => {
    const { outcome, callback } = await startFlow({ state: 's' })

    const res = await callback(
      'error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&error_description=%3Cb%3Ehi&state=s',
    )
    const page = await res.text()
    const err = await outcome

    expect(page).not.toMatch(/script|<b>|hi/)
    expect(err.message).toMatch(/unknown/)
    expect(err.message).not.toMatch(/script/)
  })

  it('keeps listening on an error callback without the right state', async () => {
    // The callback is reachable through the tunnel, so a bare error from
    // outside must not end the login.
    const { outcome, callback } = await startFlow({ state: 'st4te' })
    mockTokenExchange()

    const bare = await callback('error=access_denied')
    expect(bare.status).toBe(400)
    expect(await bare.text()).toMatch(/State mismatch/)

    const wrong = await callback('error=access_denied&state=wrong')
    expect(wrong.status).toBe(400)
    expect(await wrong.text()).toMatch(/State mismatch/)

    await callback('code=c&state=st4te')
    expect((await outcome).accessToken).toBe('acc')
  })

  it('answers 500 and rejects when the exchange fails', async () => {
    const { outcome, callback } = await startFlow({ state: 's' })
    mockApi().post(TOKEN_PATH).reply(400, { error: 'invalid_grant' })

    const res = await callback('code=c&state=s')
    const page = await res.text()
    const err = await outcome

    expect(res.status).toBe(500)
    expect(page).toMatch(/exchange failed/i)
    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/Authorization failed \(.*invalid_grant.*\)/)
    expect(err.message).toMatch(/Run: exactcli auth login/)
    expect(err.cause.statusCode).toBe(400)
  })

  it('rejects with 77 after the timeout elapses', async () => {
    const port = await freePort()

    const err = await authorizationCodeFlow({
      host: HOST,
      clientId: 'cid',
      clientSecret: SECRET,
      redirectUri: REDIRECT,
      port,
      timeout: 150,
    }).catch((e) => e)

    expect(err.exitCode).toBe(77)
    expect(err.message).toMatch(/timed out/i)
    await expect(fetch(`http://127.0.0.1:${port}/callback`)).rejects.toThrow()
  })

  it('closes the server when it fails after it started to listen', async () => {
    const { outcome, port, server } = await startFlow({ state: 's' })

    server.emit('error', new Error('boom'))
    const err = await outcome

    expect(err.exitCode).toBe(78)
    expect(err.message).toMatch(/boom/)
    await expect(fetch(`http://127.0.0.1:${port}/callback`)).rejects.toThrow()
  })

  it('rejects with 78 when the default callback port is in use', async () => {
    const release = await occupy(DEFAULT_PORT)

    try {
      const err = await authorizationCodeFlow({
        host: HOST,
        clientId: 'cid',
        clientSecret: SECRET,
        redirectUri: REDIRECT,
      }).catch((e) => e)

      expect(err.exitCode).toBe(78)
      expect(err.message).toMatch(new RegExp(`port ${DEFAULT_PORT}`))
    } finally {
      await release()
    }
  })
})

describe('manualCodeFlow', () => {
  const options = {
    host: HOST,
    clientId: 'cid',
    clientSecret: SECRET,
    redirectUri: REDIRECT,
  }

  it('extracts the code from a pasted redirect URL', async () => {
    const { captured } = mockTokenExchange()

    const tokens = await manualCodeFlow({
      ...options,
      prompt: async () => `  ${REDIRECT}?code=from-url&state=s  `,
    })

    expect(captured.code).toBe('from-url')
    expect(captured.redirect_uri).toBe(REDIRECT)
    expect(tokens.accessToken).toBe('acc')
  })

  it('decodes a code from a URL only once', async () => {
    // searchParams already decoded it, so a second decode would mangle a
    // literal percent sign.
    const { captured } = mockTokenExchange()

    await manualCodeFlow({
      ...options,
      prompt: async () => `${REDIRECT}?code=100%25pure`,
    })

    expect(captured.code).toBe('100%pure')
  })

  it('accepts a bare code and decodes it', async () => {
    const { captured } = mockTokenExchange()

    await manualCodeFlow({ ...options, prompt: async () => ' ab%21cd \n' })

    expect(captured.code).toBe('ab!cd')
  })

  it('refuses a bare code with a malformed escape', async () => {
    const err = await manualCodeFlow({
      ...options,
      prompt: async () => '100%pure',
    }).catch((e) => e)

    expect(err.exitCode).toBe(64)
    expect(err.message).toBe('Invalid authorization code')
  })

  it('refuses an empty answer with exit 64', async () => {
    const err = await manualCodeFlow({
      ...options,
      prompt: async () => '   ',
    }).catch((e) => e)

    expect(err.exitCode).toBe(64)
    expect(err.message).toBe('No authorization code provided')
  })

  it('refuses a URL that carries no code', async () => {
    const err = await manualCodeFlow({
      ...options,
      prompt: async () => `${REDIRECT}?error=access_denied`,
    }).catch((e) => e)

    expect(err.exitCode).toBe(64)
  })

  it('asks for the redirected URL or the code by default', async () => {
    const { captured } = mockTokenExchange()

    await manualCodeFlow(options)

    expect(prompts.input).toHaveBeenCalledWith({
      message: 'Paste the redirected URL or the code:',
    })
    expect(captured.code).toBe('prompted-code')
  })
})
