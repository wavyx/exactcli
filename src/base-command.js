import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import createDebug from 'debug'
import { formatOutput } from './lib/output/index.js'
import { jqBinaryExists, jqBinaryPath } from './lib/jq.js'
import { PROFILE_NAME_RE, loadConfig } from './lib/config.js'
import { getValidOAuthAccess, resolveCredentials } from './lib/auth.js'
import { createClient } from './lib/client.js'
import { requireDivision } from './lib/odata.js'
import { handleError, CliError } from './lib/errors.js'

const OUTPUT_FORMATS = ['table', 'json', 'yaml', 'csv']

/** Default upper bound on a single jq call before we treat it as hung. */
const JQ_TIMEOUT_MS = 15_000

/**
 * Run a jq filter and guard only against a HANG. npm >= 11 blocks the
 * preinstall of node-jq, so an installed exactcli can miss the jq binary at
 * node_modules/node-jq/bin/jq. The run() of node-jq then does NOT reject on
 * the spawn ENOENT: it hangs forever. Bound it. Race the run against a timeout
 * and, when the timeout wins, fail fast with 69. A real REJECTION is a real jq
 * error (an invalid filter compiles to a syntax error), so pass it through
 * unchanged and show the diagnostic of jq itself. EXACTCLI_JQ_TIMEOUT_MS (ms)
 * overrides the bound for slow machines and tests; a non-positive or
 * non-finite value falls back to the default.
 * @param {string} filter jq expression
 * @param {string} input JSON string
 * @returns {Promise<string>}
 */
async function runJq(filter, input) {
  const override = Number(process.env.EXACTCLI_JQ_TIMEOUT_MS)
  const timeoutMs =
    Number.isFinite(override) && override > 0 ? override : JQ_TIMEOUT_MS
  const { run } = await import('node-jq')
  if (!jqBinaryExists()) {
    throw new CliError(
      `jq binary not found at ${jqBinaryPath()}. Run: npm rebuild node-jq ` +
        '(or set JQ_PATH to a jq binary).',
      { exitCode: 69 },
    )
  }
  const TIMED_OUT = Symbol('jq-timeout')
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(TIMED_OUT), timeoutMs)
    timer.unref?.() // never hold the event loop open just for this guard
  })
  try {
    return await Promise.race([
      run(filter, input, { input: 'string', output: 'pretty' }),
      timeout,
    ])
  } catch (cause) {
    if (cause === TIMED_OUT) {
      throw new CliError(
        `jq did not respond within ${timeoutMs}ms. The jq binary may be ` +
          'missing or broken. Try: npm rebuild node-jq, or install jq.',
        { exitCode: 69 },
      )
    }
    throw cause // a real jq error, for example an invalid filter
  } finally {
    clearTimeout(timer)
  }
}

export default class BaseCommand extends Command {
  static baseFlags = {
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      helpGroup: 'GLOBAL',
      options: OUTPUT_FORMATS,
    }),
    jq: Flags.string({
      description: 'jq expression to filter JSON output',
      helpGroup: 'GLOBAL',
    }),
    fields: Flags.string({
      description: 'Comma-separated fields to display',
      helpGroup: 'GLOBAL',
    }),
    profile: Flags.string({
      description: 'Named auth profile to use',
      helpGroup: 'GLOBAL',
      env: 'EXACTCLI_PROFILE',
    }),
    division: Flags.string({
      description: 'Division code (administration)',
      helpGroup: 'GLOBAL',
      env: 'EXACTCLI_DIVISION',
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output',
      helpGroup: 'GLOBAL',
    }),
    verbose: Flags.boolean({
      description: 'Show detailed API request and response on errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    'no-retry': Flags.boolean({
      description: 'Disable automatic retry on rate limits and 5xx errors',
      helpGroup: 'GLOBAL',
      default: false,
    }),
    timeout: Flags.integer({
      description: 'Request timeout in milliseconds',
      helpGroup: 'GLOBAL',
    }),
    limit: Flags.integer({
      description: 'Maximum number of items to return (lists)',
      helpGroup: 'GLOBAL',
      min: 1,
    }),
  }

  /** @type {string} */
  activeProfile
  /** @type {ReturnType<import('./lib/client.js').createClient>} */
  apiClient

  async init() {
    await super.init()
    const { flags } = await this.parse(/** @type {any} */ (this.constructor))
    this.flags = flags

    if (flags['no-color'] || process.env.NO_COLOR) {
      // chalk read the color support when it was imported, so FORCE_COLOR
      // alone arrives too late. It still travels to a child process.
      process.env.FORCE_COLOR = '0'
      chalk.level = 0
    }

    if (flags.verbose) {
      // debug read DEBUG when it was imported, so enable() is what turns the
      // namespaces on for the loggers this process already built.
      const namespaces = [process.env.DEBUG, 'exact:*']
        .filter(Boolean)
        .join(',')
      process.env.DEBUG = namespaces
      createDebug.enable(namespaces)
    }

    // The profile name becomes a lock file name and a keychain entry.
    if (flags.profile !== undefined && !PROFILE_NAME_RE.test(flags.profile)) {
      throw new CliError(
        'Profile names may contain letters, digits, dot, underscore and dash',
        { exitCode: 64 },
      )
    }

    const config = loadConfig(flags.profile)
    this.activeProfile = config.activeProfile

    if (this.constructor.skipAuth) return

    const creds = await resolveCredentials({ profile: this.activeProfile })

    this.apiClient = createClient({
      host: creds.host,
      token: creds.token,
      retry: !flags['no-retry'],
      timeout: flags.timeout,
      userAgent: `exactcli/${this.config.version}`,
      // A token from EXACTCLI_ACCESS_TOKEN carries no refresh token, so a 401
      // on that path stays a 401 instead of reaching for the keychain.
      onRefresh: creds.oauth
        ? async () =>
            (await getValidOAuthAccess(this.activeProfile, { force: true }))
              .accessToken
        : undefined,
    })
  }

  /**
   * The `default_output` of the profile, when valid. Safe to call before the
   * parse completes: handleError runs for a parse failure too, and `this.flags`
   * is still undefined then.
   * @returns {string | undefined}
   */
  storedDefaultOutput() {
    let stored
    try {
      stored = loadConfig(this.flags?.profile).default_output
    } catch {
      // The error handler reads this while it reports another failure, so a
      // broken config must never crash the error report itself.
      return undefined
    }
    return OUTPUT_FORMATS.includes(stored) ? stored : undefined
  }

  /**
   * Effective output format: the explicit flag, else the `default_output` of
   * the profile, else table on a TTY and json when piped.
   * @returns {string}
   */
  resolveFormat() {
    return (
      this.flags.output ??
      this.storedDefaultOutput() ??
      (process.stdout.isTTY ? 'table' : 'json')
    )
  }

  /**
   * The division to address: the `--division` flag (which also reads
   * EXACTCLI_DIVISION), else the division of the profile.
   * @returns {number}
   */
  resolveDivision() {
    return requireDivision(
      this.flags.division ?? loadConfig(this.flags.profile).division,
    )
  }

  /**
   * @param {object | object[]} data
   * @param {Record<string, import('./lib/output/table.js').Column>} columns
   */
  async outputResults(data, columns) {
    if (this.flags.jq) {
      // node-jq ships a native binary, so load it only when it is used.
      // A single record passes UNWRAPPED: `--jq .ID` works on a get without
      // the `.[0]` indirection. runJq bounds the call, so a missing or broken
      // jq binary fails fast instead of hanging.
      this.log(await runJq(this.flags.jq, JSON.stringify(data)))
      return
    }

    let filteredColumns = columns
    let outData = data
    if (this.flags.fields) {
      const requested = this.flags.fields.split(',').map((f) => f.trim())
      filteredColumns = Object.fromEntries(
        Object.entries(columns).filter(([key]) => requested.includes(key)),
      )
      // table and csv project through `columns`; json and yaml serialize the
      // data as it is, so project the records themselves by key. Otherwise
      // --fields is silently ignored for the machine consumers it serves.
      // `Object(row)` keeps the pick safe for null and for a primitive.
      const format = this.resolveFormat()
      if (format === 'json' || format === 'yaml') {
        const pick = (row) =>
          Object.fromEntries(
            requested.filter((k) => k in Object(row)).map((k) => [k, row[k]]),
          )
        outData = Array.isArray(data) ? data.map(pick) : pick(data)
      }
    }

    formatOutput(outData, filteredColumns, this.resolveFormat(), this)
  }

  /**
   * Report the result of a mutating action. Interactive table mode prints the
   * human one-liner. Any machine format (an explicit --output, a json, yaml or
   * csv profile default, or a piped stdout) emits `machineObject` through
   * outputResults, so `--output json | jq`, --fields and --jq all work.
   * @param {object} machineObject the structured result, for example
   *   { deleted: 42 }
   * @param {string} humanMessage the interactive one-liner
   */
  async outputAction(machineObject, humanMessage) {
    if (this.resolveFormat() === 'table') {
      this.log(humanMessage)
      return
    }
    await this.outputResults(machineObject, {})
  }

  async catch(err) {
    handleError(err, this)
  }
}
