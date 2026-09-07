import { randomBytes } from 'node:crypto'
import { Flags } from '@oclif/core'
import { input, password } from '@inquirer/prompts'
import chalk from 'chalk'
import open from 'open'
import ora from 'ora'
import BaseCommand from '../../base-command.js'
import {
  authUrl,
  authorizationCodeFlow,
  fetchMe,
  manualCodeFlow,
} from '../../lib/auth.js'
import { DEFAULT_HOST, HOST_RE, createClient } from '../../lib/client.js'
import {
  getProfileConfig,
  normalizeDomain,
  setProfileConfig,
} from '../../lib/config.js'
import { CliError, ConfigError } from '../../lib/errors.js'
import { setOAuthTokens } from '../../lib/keychain.js'
import { startTunnel } from '../../lib/ngrok.js'

export default class LoginCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Authenticate with Exact Online (OAuth 2.0 authorization code)'

  static examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --host start.exactonline.nl',
    '<%= config.bin %> auth login --ngrok-domain acme.ngrok-free.app',
    '<%= config.bin %> auth login --manual',
  ]

  static flags = {
    host: Flags.string({
      description: `Exact Online country host (default: the host of the profile, else ${DEFAULT_HOST})`,
    }),
    'ngrok-domain': Flags.string({
      description:
        'Reserved ngrok domain in front of the callback, for example acme.ngrok-free.app',
    }),
    port: Flags.integer({
      description: 'Local port that receives the callback',
      default: 9999,
    }),
    'client-id': Flags.string({
      description: 'OAuth client ID (env EXACTCLI_CLIENT_ID)',
    }),
    'client-secret': Flags.string({
      description:
        'OAuth client secret (env EXACTCLI_CLIENT_SECRET). Prefer the prompt: flags stay in shell history',
    }),
    'force-login': Flags.boolean({
      description:
        'Show the Exact login form even when the browser has a session, ' +
        'to sign in as another user',
      default: false,
    }),
    manual: Flags.boolean({
      description:
        'Paste the redirected URL instead of catching the callback on a local port',
      default: false,
    }),
  }

  async run() {
    const { flags } = await this.parse(LoginCommand)
    const profile = this.activeProfile

    const host = this.#resolveHost(flags, profile)
    const domain = await this.#resolveDomain(flags, profile)
    const redirectUri = `https://${domain}/callback`

    // The registration must exist before the secret is worth typing.
    this.log(`Redirect URI: ${redirectUri}`)
    this.log(
      'Register this URI in Exact Online: Company name > Import/Export > App registrations',
    )

    const clientId =
      flags['client-id'] ??
      process.env.EXACTCLI_CLIENT_ID ??
      (await input({
        message: 'Client ID (App registrations in Exact Online):',
      }))
    const clientSecret = await this.#resolveSecret(flags)

    const app = {
      host,
      clientId,
      clientSecret,
      redirectUri,
      forceLogin: flags['force-login'],
    }
    const tokens = flags.manual
      ? await this.#manualLogin(app)
      : await this.#tunnelLogin(app, { domain, port: flags.port })

    const now = Date.now()
    await setOAuthTokens(profile, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      obtainedAt: now,
      expiresAt: now + tokens.expiresIn * 1000,
      clientId,
      clientSecret,
      // A lock set before the login must survive it.
      readOnly: getProfileConfig(profile, 'read_only') === true,
    })
    // Only a login that succeeded may re-point the profile: an aborted login
    // on another host must leave a working session where it was.
    this.#storeProfile(profile, { host, ngrok_domain: domain })

    await this.#reportIdentity({ host, profile, token: tokens.accessToken })
  }

  /**
   * @param {Record<string, any>} flags
   * @param {string} profile
   * @returns {string}
   */
  #resolveHost(flags, profile) {
    const host = flags.host ?? getProfileConfig(profile, 'host') ?? DEFAULT_HOST
    if (!HOST_RE.test(host)) {
      throw new ConfigError(`Host ${host} is not an Exact Online host`)
    }
    return host
  }

  /**
   * Write the values that differ from the stored ones.
   * @param {string} profile
   * @param {Record<string, string>} values
   */
  #storeProfile(profile, values) {
    for (const [key, value] of Object.entries(values)) {
      if (getProfileConfig(profile, key) !== value) {
        setProfileConfig(profile, key, value)
      }
    }
  }

  /**
   * @param {Record<string, any>} flags
   * @param {string} profile
   * @returns {Promise<string>}
   */
  async #resolveDomain(flags, profile) {
    // An empty stored value is a broken profile, not a choice: ask again.
    const stored = getProfileConfig(profile, 'ngrok_domain') || undefined
    const domain = normalizeDomain(
      flags['ngrok-domain'] ??
        stored ??
        (await input({
          message: 'ngrok static domain (for example acme.ngrok-free.app):',
          validate: (value) =>
            normalizeDomain(value) !== '' || 'Enter your ngrok static domain',
        })),
    )
    // Without a domain the redirect URI reads https:///callback, which the
    // profile would keep for every later login.
    if (!domain) {
      throw new CliError(
        'ngrok domain is required (for example acme.ngrok-free.app)',
        { exitCode: 64 },
      )
    }
    return domain
  }

  /**
   * @param {Record<string, any>} flags
   * @returns {Promise<string>}
   */
  async #resolveSecret(flags) {
    if (flags['client-secret']) {
      this.warn(
        'Prefer the prompt or EXACTCLI_CLIENT_SECRET: flags stay in shell history',
      )
      return flags['client-secret']
    }
    return (
      process.env.EXACTCLI_CLIENT_SECRET ??
      (await password({ message: 'Client secret:', mask: true }))
    )
  }

  /**
   * @param {{host: string, clientId: string, clientSecret: string,
   *   redirectUri: string}} app
   * @returns {Promise<import('../../lib/auth.js').TokenSet>}
   */
  async #manualLogin(app) {
    // manualCodeFlow only asks for the code, so the URL to visit comes from
    // here.
    this.log('Open this URL in a browser to sign in:')
    this.log(
      authUrl(app.host, {
        clientId: app.clientId,
        redirectUri: app.redirectUri,
        forceLogin: app.forceLogin,
      }),
    )
    return manualCodeFlow(app)
  }

  /**
   * @param {{host: string, clientId: string, clientSecret: string,
   *   redirectUri: string}} app
   * @param {{domain: string, port: number}} tunnelOptions
   * @returns {Promise<import('../../lib/auth.js').TokenSet>}
   */
  async #tunnelLogin(app, { domain, port }) {
    const state = randomBytes(16).toString('hex')
    // The tunnel goes up first: the browser must find the callback ready.
    const tunnel = await startTunnel({ domain, port })
    let spinner
    try {
      return await authorizationCodeFlow({
        ...app,
        port,
        state,
        onReady: (url) => {
          this.log(
            'Opening your browser to sign in. If it does not open, visit:',
          )
          this.log(url)
          // A machine without a browser must not lose the login: the URL is
          // already on screen.
          open(url).catch(() => {})
          spinner = ora('Waiting for the authorization callback...').start()
        },
      })
    } finally {
      spinner?.stop()
      tunnel.stop()
    }
  }

  /**
   * The tokens are already stored, so a failed identity read is a report
   * problem, not a login problem.
   * @param {{host: string, profile: string, token: string}} options
   */
  async #reportIdentity({ host, profile, token }) {
    let me
    // Only the read is best-effort. A failed division write is a real
    // failure and must not hide behind the identity warning.
    try {
      me = await fetchMe(
        createClient({
          host,
          token,
          retry: false,
          timeout: this.flags.timeout,
          userAgent: `exactcli/${this.config.version}`,
        }),
      )
      if (!me) throw new Error('empty Me response')
    } catch (err) {
      this.warn(`Logged in, but the identity check failed: ${err.message}`)
      return
    }
    this.log(
      chalk.green(`Logged in to ${host} as ${me.FullName} (${me.Email})`),
    )
    this.log(`Division: ${this.#storeDivision(profile, me.CurrentDivision)}`)
  }

  /**
   * @param {string} profile
   * @param {unknown} current the CurrentDivision of the account
   * @returns {unknown} the division to report
   */
  #storeDivision(profile, current) {
    const stored = getProfileConfig(profile, 'division')
    if (stored !== undefined) return stored
    if (!Number.isInteger(current)) return '(not set)'
    setProfileConfig(profile, 'division', current)
    return current
  }
}
