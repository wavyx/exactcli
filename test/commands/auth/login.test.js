import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runCmd } from '../../helpers.js'

const DOMAIN = 'acme.ngrok-free.app'
const REDIRECT = `https://${DOMAIN}/callback`
const AUTH_URL = 'https://start.exactonline.be/api/oauth2/auth?client_id=cid'
const TOKENS = { accessToken: 'at-1', refreshToken: 'rt-1', expiresIn: 600 }
const ME = {
  CurrentDivision: 123456,
  FullName: 'Jane Doe',
  Email: 'jane@acme.example',
}

const mocks = vi.hoisted(() => {
  const spinner = { stop: vi.fn() }
  spinner.start = vi.fn(() => spinner)
  return {
    spinner,
    stopTunnel: vi.fn(),
    authorizationCodeFlow: vi.fn(),
    manualCodeFlow: vi.fn(),
    fetchMe: vi.fn(),
    loadConfig: vi.fn(() => ({ activeProfile: 'default' })),
    getProfileConfig: vi.fn(),
    setProfileConfig: vi.fn(),
    setOAuthTokens: vi.fn(),
    getOAuthTokens: vi.fn(),
    startTunnel: vi.fn(),
    input: vi.fn(),
    password: vi.fn(),
    open: vi.fn(),
    ora: vi.fn(() => spinner),
  }
})

vi.mock('../../../src/lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  authorizationCodeFlow: mocks.authorizationCodeFlow,
  manualCodeFlow: mocks.manualCodeFlow,
  fetchMe: mocks.fetchMe,
}))
vi.mock('../../../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfig: mocks.loadConfig,
  getProfileConfig: mocks.getProfileConfig,
  setProfileConfig: mocks.setProfileConfig,
}))
vi.mock('../../../src/lib/keychain.js', () => ({
  setOAuthTokens: mocks.setOAuthTokens,
  getOAuthTokens: mocks.getOAuthTokens,
}))
vi.mock('../../../src/lib/ngrok.js', () => ({ startTunnel: mocks.startTunnel }))
vi.mock('@inquirer/prompts', () => ({
  input: mocks.input,
  password: mocks.password,
}))
// The real client still runs; the spy only records what the probe built.
vi.mock('../../../src/lib/client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createClient: vi.fn(actual.createClient) }
})
vi.mock('open', () => ({ default: mocks.open }))
vi.mock('ora', () => ({ default: mocks.ora }))

const { default: LoginCommand } =
  await import('../../../src/commands/auth/login.js')
const { createClient } = await import('../../../src/lib/client.js')

/** Drive getProfileConfig from a plain key/value map. */
function profile(values = {}) {
  mocks.getProfileConfig.mockImplementation((_profile, key) => values[key])
}

/** Run the command and capture the stderr warnings next to stdout. */
async function runWithWarnings(argv) {
  const warnings = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    warnings.push(args.map(String).join(' '))
  })
  try {
    const stdout = await runCmd(LoginCommand, argv)
    // oclif wraps a warning over several lines and prefixes each one.
    const warned = warnings
      .join(' ')
      .replace(/ \u203a/g, '')
      .replace(/\s+/g, ' ')
    return { stdout, warnings: warned }
  } finally {
    spy.mockRestore()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadConfig.mockReturnValue({ activeProfile: 'default' })
  mocks.ora.mockReturnValue(mocks.spinner)
  mocks.spinner.start.mockReturnValue(mocks.spinner)
  profile({ ngrok_domain: DOMAIN })
  mocks.manualCodeFlow.mockResolvedValue(TOKENS)
  mocks.authorizationCodeFlow.mockResolvedValue(TOKENS)
  mocks.fetchMe.mockResolvedValue(ME)
  mocks.startTunnel.mockResolvedValue({
    url: `https://${DOMAIN}`,
    stop: mocks.stopTunnel,
  })
  mocks.open.mockResolvedValue(undefined)
  process.env.EXACTCLI_CLIENT_SECRET = 'csec'
})

afterEach(() => {
  delete process.env.EXACTCLI_CLIENT_ID
  delete process.env.EXACTCLI_CLIENT_SECRET
})

describe('auth login --force-login', () => {
  it('asks Exact for the login form, in the URL and in the flow', async () => {
    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--force-login',
      '--client-id',
      'cid',
    ])

    expect(stdout).toMatch(/force_login=1/)
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ forceLogin: true }),
    )
  })
})

describe('auth login --manual', () => {
  it('passes --timeout to the identity probe', async () => {
    await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
      '--timeout',
      '1234',
    ])

    expect(createClient.mock.calls[0][0].timeout).toBe(1234)
  })

  it('stores the token blob and reports the identity', async () => {
    const before = Date.now()

    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(mocks.startTunnel).not.toHaveBeenCalled()
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith({
      host: 'start.exactonline.be',
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: REDIRECT,
      forceLogin: false,
    })
    const [profileName, blob] = mocks.setOAuthTokens.mock.calls[0]
    expect(profileName).toBe('default')
    expect(blob).toMatchObject({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      clientId: 'cid',
      clientSecret: 'csec',
      readOnly: false,
    })
    expect(blob.obtainedAt).toBeGreaterThanOrEqual(before)
    expect(blob.expiresAt).toBe(blob.obtainedAt + 600_000)
    expect(stdout).toContain(`Redirect URI: ${REDIRECT}`)
    expect(stdout).toContain(
      'Register this URI in Exact Online: Company name > Import/Export > App registrations',
    )
    expect(stdout).toContain(
      'Logged in to start.exactonline.be as Jane Doe (jane@acme.example)',
    )
    expect(stdout).toContain('Division: 123456')
  })

  it('prints the authorization URL to open by hand', async () => {
    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(stdout).toContain(
      'https://start.exactonline.be/api/oauth2/auth?client_id=cid',
    )
    expect(stdout).toContain(encodeURIComponent(REDIRECT))
    expect(stdout).not.toContain('csec')
  })

  it('persists the default host and keeps the stored ngrok domain', async () => {
    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    expect(mocks.setProfileConfig).toHaveBeenCalledWith(
      'default',
      'host',
      'start.exactonline.be',
    )
    expect(mocks.setProfileConfig).toHaveBeenCalledWith(
      'default',
      'division',
      123456,
    )
    expect(mocks.setProfileConfig).not.toHaveBeenCalledWith(
      'default',
      'ngrok_domain',
      expect.anything(),
    )
  })

  it('persists a host given on the flag', async () => {
    profile({ host: 'start.exactonline.be', ngrok_domain: DOMAIN })

    await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
      '--host',
      'start.exactonline.nl',
    ])

    expect(mocks.setProfileConfig).toHaveBeenCalledWith(
      'default',
      'host',
      'start.exactonline.nl',
    )
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'start.exactonline.nl' }),
    )
  })

  it('stores the read-only lock of the profile in the blob', async () => {
    // A lock set before the login must survive it: the blob is the carrier
    // that an empty config directory cannot drop.
    profile({ ngrok_domain: DOMAIN, read_only: true })

    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    expect(mocks.setOAuthTokens.mock.calls[0][1].readOnly).toBe(true)
  })

  it('stores the write division list of the profile in the blob', async () => {
    profile({ ngrok_domain: DOMAIN, write_divisions: [123456] })

    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    expect(mocks.setOAuthTokens.mock.calls[0][1].writeDivisions).toEqual([
      123456,
    ])
  })

  it('never widens the write list or drops the lock of the stored blob', async () => {
    // An empty or edited config directory must not loosen a credential that
    // a login replaces: only the divisions that both carriers name remain.
    profile({ ngrok_domain: DOMAIN, write_divisions: [123456, 42] })
    mocks.getOAuthTokens.mockResolvedValue({
      accessToken: 'old',
      readOnly: true,
      writeDivisions: [123456],
    })

    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    const stored = mocks.setOAuthTokens.mock.calls[0][1]
    expect(stored.writeDivisions).toEqual([123456])
    expect(stored.readOnly).toBe(true)
  })

  it('stores no write list when neither carrier holds one', async () => {
    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    expect(mocks.setOAuthTokens.mock.calls[0][1].writeDivisions).toBeUndefined()
  })

  it('writes the host and the domain only after the tokens are stored', async () => {
    profile({})
    mocks.input.mockResolvedValue(DOMAIN)

    await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
      '--host',
      'start.exactonline.nl',
    ])

    const stored = mocks.setOAuthTokens.mock.invocationCallOrder[0]
    for (const key of ['host', 'ngrok_domain']) {
      const index = mocks.setProfileConfig.mock.calls.findIndex(
        ([, k]) => k === key,
      )
      expect(index).toBeGreaterThanOrEqual(0)
      expect(
        mocks.setProfileConfig.mock.invocationCallOrder[index],
      ).toBeGreaterThan(stored)
    }
  })

  it('leaves the stored host untouched when the login is aborted', async () => {
    // An aborted login on .nl must not re-point a working .be session.
    profile({ host: 'start.exactonline.be', ngrok_domain: DOMAIN })
    mocks.manualCodeFlow.mockRejectedValue(
      new Error('No authorization code provided'),
    )

    const err = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
      '--host',
      'start.exactonline.nl',
    ]).catch((e) => e)

    expect(err.message).toMatch(/No authorization code provided/)
    expect(mocks.setProfileConfig).not.toHaveBeenCalled()
    expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('keeps the stored host and the stored division', async () => {
    profile({
      host: 'start.exactonline.nl',
      ngrok_domain: DOMAIN,
      division: 999,
    })

    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(mocks.setProfileConfig).not.toHaveBeenCalled()
    expect(stdout).toContain('Logged in to start.exactonline.nl')
    expect(stdout).toContain('Division: 999')
  })

  it('refuses a host outside the Exact Online allowlist', async () => {
    const err = await runCmd(LoginCommand, [
      '--manual',
      '--host',
      'evil.example.com',
    ]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(
      /Host evil\.example\.com is not an Exact Online host/,
    )
    expect(mocks.setProfileConfig).not.toHaveBeenCalled()
    expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('prompts for the domain, the client id and the secret', async () => {
    profile({})
    delete process.env.EXACTCLI_CLIENT_SECRET
    mocks.input
      .mockResolvedValueOnce(`https://${DOMAIN}/`)
      .mockResolvedValueOnce('prompt-cid')
    mocks.password.mockResolvedValue('prompt-secret')

    const stdout = await runCmd(LoginCommand, ['--manual'])

    expect(mocks.setProfileConfig).toHaveBeenCalledWith(
      'default',
      'ngrok_domain',
      DOMAIN,
    )
    expect(stdout).toContain(`Redirect URI: ${REDIRECT}`)
    expect(mocks.password).toHaveBeenCalledWith(
      expect.objectContaining({ mask: true }),
    )
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'prompt-cid',
        clientSecret: 'prompt-secret',
      }),
    )
  })

  it('reads the client credentials from the environment', async () => {
    process.env.EXACTCLI_CLIENT_ID = 'env-cid'

    await runCmd(LoginCommand, ['--manual'])

    expect(mocks.input).not.toHaveBeenCalled()
    expect(mocks.password).not.toHaveBeenCalled()
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'env-cid', clientSecret: 'csec' }),
    )
  })

  it('warns once when the secret arrives on a flag', async () => {
    const { stdout, warnings } = await runWithWarnings([
      '--manual',
      '--client-id',
      'cid',
      '--client-secret',
      'flag-secret',
    ])

    expect(warnings).toContain(
      'Prefer the prompt or EXACTCLI_CLIENT_SECRET: flags stay in shell history',
    )
    expect(warnings).not.toContain('flag-secret')
    expect(stdout).not.toContain('flag-secret')
    expect(mocks.manualCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'flag-secret' }),
    )
  })

  it('reports no division when Me carries none', async () => {
    mocks.fetchMe.mockResolvedValue({ ...ME, CurrentDivision: null })

    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(stdout).toContain('Division: (not set)')
    expect(mocks.setProfileConfig).not.toHaveBeenCalledWith(
      'default',
      'division',
      expect.anything(),
    )
  })

  it('keeps the tokens when the identity check fails', async () => {
    mocks.fetchMe.mockRejectedValue(new Error('network down'))

    const { warnings } = await runWithWarnings([
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(warnings).toContain(
      'Logged in, but the identity check failed: network down',
    )
    expect(mocks.setOAuthTokens).toHaveBeenCalled()
  })

  it('refuses an empty ngrok domain on the flag', async () => {
    const err = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
      '--ngrok-domain',
      '',
    ]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(
      /ngrok domain is required \(for example acme\.ngrok-free\.app\)/,
    )
    expect(mocks.setProfileConfig).not.toHaveBeenCalledWith(
      'default',
      'ngrok_domain',
      expect.anything(),
    )
    expect(mocks.manualCodeFlow).not.toHaveBeenCalled()
  })

  it('asks again when the profile holds an empty ngrok domain', async () => {
    profile({ ngrok_domain: '' })
    mocks.input.mockResolvedValue(DOMAIN)

    const stdout = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(mocks.input).toHaveBeenCalled()
    expect(mocks.setProfileConfig).toHaveBeenCalledWith(
      'default',
      'ngrok_domain',
      DOMAIN,
    )
    expect(stdout).toContain(`Redirect URI: ${REDIRECT}`)
  })

  it('refuses an empty answer at the domain prompt', async () => {
    profile({})
    mocks.input.mockResolvedValue(DOMAIN)

    await runCmd(LoginCommand, ['--manual', '--client-id', 'cid'])

    const { validate } = mocks.input.mock.calls[0][0]
    expect(validate('')).toBe('Enter your ngrok static domain')
    expect(validate('  https://acme.ngrok-free.app/  ')).toBe(true)
  })

  it('prints the redirect URI before it asks for the secret', async () => {
    delete process.env.EXACTCLI_CLIENT_SECRET
    mocks.password.mockResolvedValue('prompt-secret')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let printedAt
    try {
      await LoginCommand.run(['--manual', '--client-id', 'cid'])
      const index = spy.mock.calls.findIndex(([first]) =>
        String(first).startsWith('Redirect URI:'),
      )
      printedAt = spy.mock.invocationCallOrder[index]
    } finally {
      spy.mockRestore()
    }

    expect(printedAt).toBeLessThan(mocks.password.mock.invocationCallOrder[0])
  })

  it('keeps the tokens when Me comes back empty', async () => {
    mocks.fetchMe.mockResolvedValue(null)

    const { warnings } = await runWithWarnings([
      '--manual',
      '--client-id',
      'cid',
    ])

    expect(warnings).toContain(
      'Logged in, but the identity check failed: empty Me response',
    )
    expect(mocks.setOAuthTokens).toHaveBeenCalled()
  })

  it('reports a failed division write as itself', async () => {
    profile({ host: 'start.exactonline.be', ngrok_domain: DOMAIN })
    mocks.setProfileConfig.mockImplementation((_profile, key) => {
      if (key === 'division') throw new Error('conf write failed')
    })

    const err = await runCmd(LoginCommand, [
      '--manual',
      '--client-id',
      'cid',
    ]).catch((e) => e)

    expect(err.message).toMatch(/conf write failed/)
    expect(err.message).not.toMatch(/identity check failed/)
  })
})

describe('auth login (tunnel)', () => {
  beforeEach(() => {
    mocks.authorizationCodeFlow.mockImplementation(async ({ onReady }) => {
      onReady(AUTH_URL)
      return TOKENS
    })
  })

  it('starts the tunnel, opens the browser and stores the tokens', async () => {
    const stdout = await runCmd(LoginCommand, ['--client-id', 'cid'])

    expect(mocks.startTunnel).toHaveBeenCalledWith({
      domain: DOMAIN,
      port: 9999,
    })
    expect(mocks.authorizationCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'start.exactonline.be',
        clientId: 'cid',
        clientSecret: 'csec',
        redirectUri: REDIRECT,
        port: 9999,
        state: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
    )
    expect(mocks.open).toHaveBeenCalledWith(AUTH_URL)
    expect(stdout).toContain(AUTH_URL)
    expect(mocks.setOAuthTokens).toHaveBeenCalled()
    expect(mocks.stopTunnel).toHaveBeenCalled()
    expect(mocks.spinner.stop).toHaveBeenCalled()
  })

  it('starts the tunnel before the browser opens', async () => {
    await runCmd(LoginCommand, ['--client-id', 'cid'])

    expect(mocks.startTunnel.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.open.mock.invocationCallOrder[0],
    )
  })

  it('passes --port to the tunnel and to the callback server', async () => {
    mocks.authorizationCodeFlow.mockResolvedValue(TOKENS)

    await runCmd(LoginCommand, ['--client-id', 'cid', '--port', '8123'])

    expect(mocks.startTunnel).toHaveBeenCalledWith({
      domain: DOMAIN,
      port: 8123,
    })
    expect(mocks.authorizationCodeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8123 }),
    )
    expect(mocks.spinner.stop).not.toHaveBeenCalled()
  })

  it('stops the tunnel when the flow fails', async () => {
    mocks.authorizationCodeFlow.mockRejectedValue(
      new Error('Authentication timed out after 300s'),
    )

    const err = await runCmd(LoginCommand, ['--client-id', 'cid']).catch(
      (e) => e,
    )

    expect(err.message).toMatch(/Authentication timed out/)
    expect(mocks.stopTunnel).toHaveBeenCalled()
    expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
  })

  it('logs in even when no browser can open', async () => {
    mocks.open.mockRejectedValue(new Error('no browser here'))

    const stdout = await runCmd(LoginCommand, ['--client-id', 'cid'])

    expect(stdout).toContain(AUTH_URL)
    expect(mocks.setOAuthTokens).toHaveBeenCalled()
  })

  it('reports a tunnel that never starts', async () => {
    mocks.startTunnel.mockRejectedValue(
      new Error('ngrok not found on PATH. Install ngrok or use --manual'),
    )

    const err = await runCmd(LoginCommand, ['--client-id', 'cid']).catch(
      (e) => e,
    )

    expect(err.message).toMatch(/ngrok not found on PATH/)
    expect(mocks.authorizationCodeFlow).not.toHaveBeenCalled()
    expect(mocks.setOAuthTokens).not.toHaveBeenCalled()
  })
})
