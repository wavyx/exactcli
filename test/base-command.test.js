import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import nock from 'nock'
import chalk from 'chalk'
import createDebug from 'debug'
import { join } from 'node:path'
import { Flags } from '@oclif/core'
import { HOST, mockApi, runCmd } from './helpers.js'

const { auth, config, jq } = vi.hoisted(() => ({
  auth: { resolveCredentials: vi.fn(), getValidOAuthAccess: vi.fn() },
  config: { loadConfig: vi.fn(), getProfileConfig: vi.fn() },
  // node-jq ships a native binary that npm >= 11 may never install, so the
  // real run() can be missing or hang. Always mock it.
  jq: { run: vi.fn() },
}))

vi.mock('../src/lib/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...auth,
}))
// Spread the original: the command reads PROFILE_NAME_RE from the same module.
vi.mock('../src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...config,
}))
vi.mock('node-jq', () => jq)
// Keep the real lookup, but let a test force a MISSING binary deterministically.
vi.mock('../src/lib/jq.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    jqBinaryPath: vi.fn(actual.jqBinaryPath),
    jqBinaryExists: vi.fn(actual.jqBinaryExists),
  }
})
// The real client still runs; the spy only records the wiring init() built.
vi.mock('../src/lib/client.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createClient: vi.fn(actual.createClient) }
})

const { default: BaseCommand } = await import('../src/base-command.js')
const { createClient } = await import('../src/lib/client.js')
const { assertWritesAllowed } = await import('../src/lib/writes.js')
const jqLib = await import('../src/lib/jq.js')

const ME = '/api/v1/current/Me'
const COLUMNS = {
  id: { header: 'ID' },
  name: { header: 'Name' },
  email: { header: 'Email' },
}

/** Reads the API through the client that init() built. */
class ApiCmd extends BaseCommand {
  async run() {
    const body = await this.apiClient.get(ME)
    await this.outputResults(body.d, COLUMNS)
  }
}

/** Reads the API twice, so a second 401 can name the token in use. */
class TwoReadsCmd extends BaseCommand {
  async run() {
    await this.apiClient.get(ME)
    const body = await this.apiClient.get(ME)
    await this.outputResults(body.d, COLUMNS)
  }
}

/** Deletes, as every write command does: the flags carry the write gate. */
class DeleteCmd extends BaseCommand {
  static flags = {
    'allow-writes': Flags.boolean({ default: false }),
    yes: Flags.boolean({ default: false }),
  }

  async run() {
    assertWritesAllowed(this.flags, 'DELETE')
    this.log(`locked:${this.flags.readOnlyCredential ?? 'no'}`)
  }
}

/** Needs no credentials. */
class NoAuthCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    this.log(`profile:${this.activeProfile} limit:${this.flags.limit ?? ''}`)
  }
}

/** Prints one fixed record through the output pipeline. */
class RecordCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    await this.outputResults(
      { id: 1, name: 'Acme', email: 'billing@acme.test' },
      COLUMNS,
    )
  }
}

/** Prints two fixed records through the output pipeline. */
class ListCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    await this.outputResults(
      [
        { id: 1, name: 'Acme', email: 'a@acme.test' },
        { id: 2, name: 'Beta', email: 'b@acme.test' },
      ],
      COLUMNS,
    )
  }
}

class FormatCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    this.log(`format:${this.resolveFormat()}`)
  }
}

class ActionCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    await this.outputAction({ deleted: 42 }, 'Deleted sales entry 42')
  }
}

/** Prints one colored word, so a test can look for the ANSI escape. */
class ColorCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    this.log(chalk.cyan('tint'))
  }
}

class DivisionCmd extends BaseCommand {
  static skipAuth = true
  async run() {
    this.log(`division:${this.resolveDivision()}`)
  }
}

/** A stored OAuth blob, as resolveCredentials returns it. */
function oauthCreds(overrides = {}) {
  return {
    token: 'stored-access',
    source: 'profile',
    host: HOST,
    oauth: {
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      obtainedAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      clientId: 'cid',
      clientSecret: 'csec',
    },
    ...overrides,
  }
}

const chalkLevel = chalk.level

beforeEach(() => {
  nock.cleanAll()
  createClient.mockClear()
  auth.resolveCredentials.mockReset()
  auth.getValidOAuthAccess.mockReset()
  jq.run.mockReset()
  // The bundled jq binary may be absent (npm blocks the preinstall script);
  // point the pre-check at a file that exists so the run() mock is reached.
  process.env.JQ_PATH = process.execPath
  config.loadConfig.mockReset()
  config.loadConfig.mockReturnValue({ activeProfile: 'default' })
  auth.resolveCredentials.mockResolvedValue({
    token: 'env-token',
    source: 'env',
    host: HOST,
  })
})

afterEach(() => {
  nock.cleanAll()
  chalk.level = chalkLevel
  createDebug.disable()
  delete process.env.DEBUG
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
  delete process.env.EXACTCLI_DIVISION
  delete process.env.EXACTCLI_JQ_TIMEOUT_MS
  delete process.env.JQ_PATH
})

describe('BaseCommand global flags', () => {
  it('declares exactly the ten global flags, in order', () => {
    expect(Object.keys(BaseCommand.baseFlags)).toEqual([
      'output',
      'jq',
      'fields',
      'profile',
      'division',
      'no-color',
      'verbose',
      'no-retry',
      'timeout',
      'limit',
    ])
  })

  it('puts every global flag in the GLOBAL help group', () => {
    for (const flag of Object.values(BaseCommand.baseFlags)) {
      expect(flag.helpGroup).toBe('GLOBAL')
    }
  })

  it('describes --division as a string flag read from EXACTCLI_DIVISION', () => {
    const flag = BaseCommand.baseFlags.division
    expect(flag.type).toBe('option')
    expect(flag.env).toBe('EXACTCLI_DIVISION')
    expect(flag.description).toBe('Division code (administration)')
  })

  it('reads --profile from EXACTCLI_PROFILE', () => {
    expect(BaseCommand.baseFlags.profile.env).toBe('EXACTCLI_PROFILE')
  })

  it('restricts --output to the four supported formats', () => {
    expect(BaseCommand.baseFlags.output.options).toEqual([
      'table',
      'json',
      'yaml',
      'csv',
    ])
  })

  it('exposes the parsed --limit flag', async () => {
    const stdout = await runCmd(NoAuthCmd, ['--limit', '25'])
    expect(stdout).toContain('limit:25')
  })

  it.each(['0', '-5'])('rejects --limit %s with exit 64', async (value) => {
    const err = await NoAuthCmd.run(['--limit', value]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})

describe('BaseCommand init', () => {
  it('sets DEBUG=exact:* for --verbose', async () => {
    await runCmd(NoAuthCmd, ['--verbose'])
    expect(process.env.DEBUG).toBe('exact:*')
  })

  it('appends exact:* to an existing DEBUG for --verbose', async () => {
    process.env.DEBUG = 'other:*'
    await runCmd(NoAuthCmd, ['--verbose'])
    expect(process.env.DEBUG).toBe('other:*,exact:*')
  })

  it('enables the exact:* namespaces for --verbose', async () => {
    // debug reads DEBUG when it is imported, so the env variable alone
    // arrives too late for the loggers this process already built.
    expect(createDebug.enabled('exact:client')).toBe(false)
    await runCmd(NoAuthCmd, ['--verbose'])
    expect(createDebug.enabled('exact:client')).toBe(true)
  })

  it('keeps the namespaces of an existing DEBUG for --verbose', async () => {
    process.env.DEBUG = 'other:*'
    await runCmd(NoAuthCmd, ['--verbose'])
    expect(createDebug.enabled('other:thing')).toBe(true)
    expect(createDebug.enabled('exact:client')).toBe(true)
  })

  it('sets FORCE_COLOR=0 for --no-color', async () => {
    await runCmd(NoAuthCmd, ['--no-color'])
    expect(process.env.FORCE_COLOR).toBe('0')
  })

  it('sets FORCE_COLOR=0 when NO_COLOR is set', async () => {
    process.env.NO_COLOR = '1'
    await runCmd(NoAuthCmd)
    expect(process.env.FORCE_COLOR).toBe('0')
  })

  it('leaves the color untouched without --no-color or NO_COLOR', async () => {
    await runCmd(NoAuthCmd)
    expect(process.env.FORCE_COLOR).toBeUndefined()
  })

  it('prints no ANSI escape for --no-color', async () => {
    chalk.level = 3
    const stdout = await runCmd(ColorCmd, ['--no-color'])
    expect(stdout).toBe('tint')
  })

  it('prints no ANSI escape when NO_COLOR is set', async () => {
    chalk.level = 3
    process.env.NO_COLOR = '1'
    const stdout = await runCmd(ColorCmd)
    expect(stdout).toBe('tint')
  })

  it('keeps the color without --no-color or NO_COLOR', async () => {
    chalk.level = 3
    const stdout = await runCmd(ColorCmd)
    expect(stdout).toContain('\u001b[')
  })

  it.each(['../evil', 'a/b', ''])(
    'rejects the unsafe profile name %o with exit 64',
    async (name) => {
      const err = await NoAuthCmd.run(['--profile', name]).catch((e) => e)
      expect(err.exitCode ?? err.oclif?.exit).toBe(64)
      expect(err.message).toMatch(/Profile names may contain/)
    },
  )

  it('accepts a safe profile name', async () => {
    config.loadConfig.mockReturnValue({ activeProfile: 'acme.1_x-y' })
    const stdout = await runCmd(NoAuthCmd, ['--profile', 'acme.1_x-y'])
    expect(stdout).toContain('profile:acme.1_x-y')
  })

  it('skips the credential lookup when skipAuth is set', async () => {
    const stdout = await runCmd(NoAuthCmd)
    expect(auth.resolveCredentials).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    expect(stdout).toContain('profile:default')
  })

  it('resolves the credentials for the active profile', async () => {
    config.loadConfig.mockReturnValue({ activeProfile: 'acme' })
    mockApi()
      .get(ME)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, ['--output', 'json'])
    expect(auth.resolveCredentials).toHaveBeenCalledWith({ profile: 'acme' })
  })

  it('wires the client from the flags and the resolved credentials', async () => {
    mockApi()
      .get(ME)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, [
      '--output',
      'json',
      '--no-retry',
      '--timeout',
      '4200',
    ])
    const options = createClient.mock.calls[0][0]
    expect(options.host).toBe(HOST)
    expect(options.token).toBe('env-token')
    expect(options.retry).toBe(false)
    expect(options.timeout).toBe(4200)
    expect(options.userAgent).toMatch(/^exactcli\/\d+\.\d+\.\d+/)
  })

  it('enables the retry by default', async () => {
    mockApi()
      .get(ME)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, ['--output', 'json'])
    expect(createClient.mock.calls[0][0].retry).toBe(true)
  })

  it('sends the exactcli User-Agent', async () => {
    const scope = mockApi()
      .get(ME)
      .matchHeader('user-agent', /^exactcli\/\d+\.\d+\.\d+/)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, ['--output', 'json'])
    expect(scope.isDone()).toBe(true)
  })

  it('locks the client on the host the credentials carry', async () => {
    auth.resolveCredentials.mockResolvedValue({
      token: 'env-token',
      source: 'env',
      host: 'start.exactonline.nl',
    })
    const scope = mockApi('start.exactonline.nl')
      .get(ME)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, ['--output', 'json'])
    expect(scope.isDone()).toBe(true)
  })

  it('builds no refresh callback for a token from the environment', async () => {
    mockApi()
      .get(ME)
      .reply(200, { d: { id: 1, name: 'Acme' } })
    await runCmd(ApiCmd, ['--output', 'json'])
    expect(createClient.mock.calls[0][0].onRefresh).toBeUndefined()
  })

  it('never reads the keychain for a token from the environment', async () => {
    mockApi()
      .get(ME)
      .reply(401, { error: { message: { value: 'expired' } } })
    await ApiCmd.run(['--no-retry']).catch(() => {})
    expect(auth.getValidOAuthAccess).not.toHaveBeenCalled()
  })

  it('refreshes a stored token once on a 401 and retries', async () => {
    auth.resolveCredentials.mockResolvedValue(oauthCreds())
    auth.getValidOAuthAccess.mockResolvedValue({ accessToken: 'fresh-access' })
    mockApi()
      .get(ME)
      .matchHeader('authorization', 'Bearer stored-access')
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-access')
      .reply(200, { d: { id: 1, name: 'Refreshed' } })

    const stdout = await runCmd(ApiCmd, ['--output', 'json'])

    expect(stdout).toContain('Refreshed')
    expect(auth.getValidOAuthAccess).toHaveBeenCalledWith('default', {
      force: true,
      rejected: 'stored-access',
    })
  })

  it('names the token in use on every later 401', async () => {
    // After a refresh the process holds the new token. A second 401 must
    // report that one as rejected, or the floor check would look at the
    // wrong token.
    auth.resolveCredentials.mockResolvedValue(oauthCreds())
    auth.getValidOAuthAccess
      .mockResolvedValueOnce({ accessToken: 'fresh-1' })
      .mockResolvedValueOnce({ accessToken: 'fresh-2' })
    mockApi()
      .get(ME)
      .matchHeader('authorization', 'Bearer stored-access')
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-1')
      .reply(200, { d: { id: 1, name: 'First' } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-1')
      .reply(401, { error: { message: { value: 'expired' } } })
      .get(ME)
      .matchHeader('authorization', 'Bearer fresh-2')
      .reply(200, { d: { id: 2, name: 'Second' } })

    const stdout = await runCmd(TwoReadsCmd, ['--output', 'json'])

    expect(stdout).toContain('Second')
    expect(auth.getValidOAuthAccess.mock.calls).toEqual([
      ['default', { force: true, rejected: 'stored-access' }],
      ['default', { force: true, rejected: 'fresh-1' }],
    ])
  })

  it('refuses a write on a read-only credential, whatever the config says', async () => {
    // The config store knows nothing about the lock, as with an empty
    // EXACTCLI_CONFIG_DIR. The keychain blob still carries it.
    auth.resolveCredentials.mockResolvedValue(oauthCreds({ readOnly: true }))

    const err = await DeleteCmd.run(['--allow-writes', '--yes']).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(77)
    expect(err.message).toBe(
      'Profile default is read-only (config set read_only false to change it).',
    )
  })

  it('leaves the flags unmarked for a credential without the lock', async () => {
    auth.resolveCredentials.mockResolvedValue(oauthCreds({ readOnly: false }))

    const stdout = await runCmd(DeleteCmd, ['--allow-writes', '--yes'])

    expect(stdout).toBe('locked:no')
  })

  it('propagates a failed credential lookup', async () => {
    const { AuthRequiredError } = await import('../src/lib/errors.js')
    auth.resolveCredentials.mockRejectedValue(new AuthRequiredError())
    await expect(ApiCmd.run([])).rejects.toThrow(/exactcli auth login/)
  })
})

describe('BaseCommand resolveFormat', () => {
  it('defaults to table on a TTY', async () => {
    const stdout = await runCmd(FormatCmd)
    expect(stdout).toContain('format:table')
  })

  it('defaults to json when the output is piped', async () => {
    process.stdout.isTTY = false
    const stdout = await runCmd(FormatCmd)
    expect(stdout).toContain('format:json')
  })

  it('honors the stored default_output', async () => {
    config.loadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'yaml',
    })
    const stdout = await runCmd(FormatCmd)
    expect(stdout).toContain('format:yaml')
  })

  it('lets --output beat the stored default_output', async () => {
    config.loadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'yaml',
    })
    const stdout = await runCmd(FormatCmd, ['--output', 'csv'])
    expect(stdout).toContain('format:csv')
  })

  it('ignores an invalid stored default_output', async () => {
    config.loadConfig.mockReturnValue({
      activeProfile: 'default',
      default_output: 'bogus',
    })
    process.stdout.isTTY = false
    const stdout = await runCmd(FormatCmd)
    expect(stdout).toContain('format:json')
  })

  it('storedDefaultOutput returns undefined when the config read throws', () => {
    config.loadConfig.mockImplementation(() => {
      throw new Error('corrupt config')
    })
    // handleError calls this while reporting another failure, so a broken
    // config must never crash the error report itself.
    expect(
      BaseCommand.prototype.storedDefaultOutput.call({ flags: {} }),
    ).toBeUndefined()
    expect(BaseCommand.prototype.storedDefaultOutput.call({})).toBeUndefined()
  })
})

describe('BaseCommand outputResults', () => {
  it('renders a table on a TTY', async () => {
    const stdout = await runCmd(RecordCmd)
    expect(stdout).toContain('Acme')
    expect(stdout).toContain('ID')
  })

  it('renders json', async () => {
    const stdout = await runCmd(RecordCmd, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual({
      id: 1,
      name: 'Acme',
      email: 'billing@acme.test',
    })
  })

  it('renders yaml', async () => {
    const stdout = await runCmd(RecordCmd, ['--output', 'yaml'])
    expect(stdout).toContain('name: Acme')
  })

  it('renders csv with the column headers', async () => {
    const stdout = await runCmd(RecordCmd, ['--output', 'csv'])
    expect(stdout).toContain('ID,Name,Email')
    expect(stdout).toContain('1,Acme,billing@acme.test')
  })

  it('--fields limits the table columns', async () => {
    const stdout = await runCmd(RecordCmd, ['--fields', 'id,email'])
    expect(stdout).toContain('billing@acme.test')
    expect(stdout).not.toContain('Acme')
  })

  it('--fields limits the csv columns', async () => {
    const stdout = await runCmd(RecordCmd, [
      '--fields',
      'id,email',
      '--output',
      'csv',
    ])
    expect(stdout).toContain('ID,Email')
    expect(stdout).not.toContain('Name')
  })

  it('--fields projects the keys of a json record', async () => {
    const stdout = await runCmd(RecordCmd, [
      '--fields',
      'id,email',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual({ id: 1, email: 'billing@acme.test' })
  })

  it('--fields projects the keys of every json row', async () => {
    const stdout = await runCmd(ListCmd, [
      '--fields',
      'id,email',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual([
      { id: 1, email: 'a@acme.test' },
      { id: 2, email: 'b@acme.test' },
    ])
  })

  it('--fields projects the keys for yaml', async () => {
    const stdout = await runCmd(RecordCmd, [
      '--fields',
      'id,email',
      '--output',
      'yaml',
    ])
    expect(stdout).toContain('email: billing@acme.test')
    expect(stdout).not.toContain('Acme')
  })

  it('--fields drops a key that the record does not carry', async () => {
    const stdout = await runCmd(RecordCmd, [
      '--fields',
      'id, absent',
      '--output',
      'json',
    ])
    expect(JSON.parse(stdout)).toEqual({ id: 1 })
  })

  it('--jq receives the record unwrapped and prints what jq answers', async () => {
    jq.run.mockResolvedValue('"Acme"')
    const stdout = await runCmd(RecordCmd, ['--jq', '.name'])
    expect(jq.run).toHaveBeenCalledWith(
      '.name',
      JSON.stringify({ id: 1, name: 'Acme', email: 'billing@acme.test' }),
      { input: 'string', output: 'pretty' },
    )
    expect(stdout.trim()).toBe('"Acme"')
  })

  it('--jq receives an array unwrapped', async () => {
    jq.run.mockResolvedValue('"Beta"')
    const stdout = await runCmd(ListCmd, ['--jq', '.[1].name'])
    expect(jq.run.mock.calls[0][1]).toBe(
      JSON.stringify([
        { id: 1, name: 'Acme', email: 'a@acme.test' },
        { id: 2, name: 'Beta', email: 'b@acme.test' },
      ]),
    )
    expect(stdout.trim()).toBe('"Beta"')
  })

  it('--jq wins over --fields', async () => {
    jq.run.mockResolvedValue('1')
    await runCmd(RecordCmd, ['--jq', '.id', '--fields', 'name'])
    expect(jq.run.mock.calls[0][1]).toContain('"name":"Acme"')
  })
})

describe('BaseCommand runJq guard', () => {
  it('surfaces a real jq error unchanged', async () => {
    jq.run.mockRejectedValue(
      new Error('jq: error: syntax error, unexpected $end'),
    )
    const err = await RecordCmd.run(['--jq', '.[']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(70)
    expect(err.message).toMatch(/syntax error/)
    expect(err.message).not.toMatch(/did not respond/)
  })

  it('fails with exit 69 before calling jq when its binary is missing', async () => {
    process.env.JQ_PATH = '/nonexistent/jq'
    const err = await RecordCmd.run(['--jq', '.name']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
    expect(err.message).toMatch(/jq binary not found at \/nonexistent\/jq/)
    expect(err.message).toMatch(/Install jq and set JQ_PATH/)
    expect(err.message).toMatch(/npm rebuild node-jq/)
    expect(jq.run).not.toHaveBeenCalled()
  })

  it('names the bundled binary when it is missing', async () => {
    delete process.env.JQ_PATH
    const bundled = join('node_modules', 'node-jq', 'bin', 'jq')
    jqLib.jqBinaryExists.mockReturnValueOnce(false)
    jqLib.jqBinaryPath.mockReturnValueOnce(bundled)
    const err = await RecordCmd.run(['--jq', '.id']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
    expect(err.message).toMatch(/node-jq[\\/]bin[\\/]jq/)
    expect(jq.run).not.toHaveBeenCalled()
  })

  it('fails fast with exit 69 when jq never answers', async () => {
    // node-jq HANGS instead of rejecting when its binary is missing.
    jq.run.mockImplementation(() => new Promise(() => {}))
    process.env.EXACTCLI_JQ_TIMEOUT_MS = '10'
    const err = await RecordCmd.run(['--jq', '.name']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(69)
    expect(err.message).toMatch(/did not respond within 10ms/)
    expect(err.message).toMatch(/rebuild node-jq|install jq/)
  })

  it('ignores a non-positive EXACTCLI_JQ_TIMEOUT_MS', async () => {
    // An unfloored -1 would fire almost at once and kill every --jq run.
    jq.run.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('"Acme"'), 20)),
    )
    process.env.EXACTCLI_JQ_TIMEOUT_MS = '-1'
    const stdout = await runCmd(RecordCmd, ['--jq', '.name'])
    expect(stdout.trim()).toBe('"Acme"')
  })
})

describe('BaseCommand outputAction', () => {
  it('prints the human line in interactive table mode', async () => {
    const stdout = await runCmd(ActionCmd)
    expect(stdout).toBe('Deleted sales entry 42')
  })

  it('prints the machine object for --output json', async () => {
    const stdout = await runCmd(ActionCmd, ['--output', 'json'])
    expect(JSON.parse(stdout)).toEqual({ deleted: 42 })
  })

  it('honors --jq on the machine object', async () => {
    jq.run.mockResolvedValue('42')
    const stdout = await runCmd(ActionCmd, [
      '--output',
      'json',
      '--jq',
      '.deleted',
    ])
    expect(stdout.trim()).toBe('42')
  })
})

describe('BaseCommand resolveDivision', () => {
  it('takes the --division flag first', async () => {
    config.loadConfig.mockReturnValue({
      activeProfile: 'default',
      division: 456,
    })
    const stdout = await runCmd(DivisionCmd, ['--division', '123'])
    expect(stdout).toContain('division:123')
  })

  it('takes EXACTCLI_DIVISION through the flag', async () => {
    process.env.EXACTCLI_DIVISION = '777'
    const stdout = await runCmd(DivisionCmd)
    expect(stdout).toContain('division:777')
  })

  it('falls back to the division of the profile', async () => {
    config.loadConfig.mockReturnValue({
      activeProfile: 'default',
      division: 456,
    })
    const stdout = await runCmd(DivisionCmd)
    expect(stdout).toContain('division:456')
  })

  it('reads the profile named by --profile', async () => {
    config.loadConfig.mockImplementation((profile) =>
      profile === 'acme'
        ? { activeProfile: 'acme', division: 999 }
        : { activeProfile: 'default', division: 456 },
    )
    const stdout = await runCmd(DivisionCmd, ['--profile', 'acme'])
    expect(stdout).toContain('division:999')
  })

  it('fails with exit 78 when no division is configured', async () => {
    const err = await DivisionCmd.run([]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
    expect(err.message).toMatch(/No division configured/)
  })

  it('fails with exit 78 for a division that is not a code', async () => {
    const err = await DivisionCmd.run(['--division', 'abc']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(78)
  })
})

describe('BaseCommand catch', () => {
  it('reports an API error through handleError', async () => {
    mockApi()
      .get(ME)
      .reply(403, { error: { message: { value: 'Forbidden' } } })
    const err = await ApiCmd.run(['--no-retry']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(77)
    expect(err.message).toMatch(/Forbidden/)
  })

  it('maps an unknown flag to the usage exit code 64', async () => {
    const err = await NoAuthCmd.run(['--no-such-flag']).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
  })
})
