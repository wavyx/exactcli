import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import {
  REFRESH_AFTER_MS,
  REFRESH_FLOOR_MS,
  fetchMe,
  getValidOAuthAccess,
} from '../../lib/auth.js'
import { DEFAULT_HOST, createClient } from '../../lib/client.js'
import { getProfileConfig } from '../../lib/config.js'
import { getOAuthTokens, isKeychainAvailable } from '../../lib/keychain.js'
import { allowedWriteDivisions } from '../../lib/writes.js'

const DAY_MS = 86_400_000
/** A refresh token dies after 30 days without use. Warn before that. */
const IDLE_WARN_DAYS = 25
/** Column where every value starts. */
const LABEL_WIDTH = 20

export default class StatusCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Show the authentication status of the profile'

  static examples = [
    '<%= config.bin %> auth status',
    '<%= config.bin %> auth status --output json',
  ]

  async run() {
    await this.parse(StatusCommand)
    const profile = this.activeProfile
    const domain = getProfileConfig(profile, 'ngrok_domain')

    const status = {
      profile,
      keychain: isKeychainAvailable() ? 'OS keychain' : 'unavailable',
      host: getProfileConfig(profile, 'host') ?? DEFAULT_HOST,
      redirectUri: domain ? `https://${domain}/callback` : null,
      division: getProfileConfig(profile, 'division') ?? null,
      authenticated: false,
      tokenAgeSeconds: null,
      refreshableNow: null,
      refreshTokenIdleDays: null,
      readOnly: null,
      writeDivisions: null,
      identity: null,
    }

    const blob = await getOAuthTokens(profile)
    status.writeDivisions = allowedWriteDivisions(
      blob?.writeDivisions,
      getProfileConfig(profile, 'write_divisions'),
    )
    if (blob) {
      const age = Date.now() - blob.obtainedAt
      status.authenticated = true
      status.tokenAgeSeconds = Math.round(age / 1000)
      status.refreshableNow = age >= REFRESH_FLOOR_MS
      status.refreshTokenIdleDays = Math.floor(age / DAY_MS)
      status.readOnly = blob.readOnly === true
      status.identity = await this.#identity(status.host, profile, blob, age)
    }

    if (this.resolveFormat() !== 'table') {
      await this.outputResults(status, {})
      return
    }
    this.#print(status)
  }

  /**
   * Best effort: a network hiccup must not hide the rest of the report. An
   * access token past its refresh point is refreshed first, as any command
   * would: the probe must not fail on a token that expired an hour ago.
   * @param {string} host
   * @param {string} profile
   * @param {{accessToken: string}} blob
   * @param {number} age ms since the token was obtained
   * @returns {Promise<{fullName: string, email: string} | null>}
   */
  async #identity(host, profile, blob, age) {
    try {
      const token =
        age >= REFRESH_AFTER_MS
          ? (await getValidOAuthAccess(profile)).accessToken
          : blob.accessToken
      const me = await fetchMe(
        createClient({
          host,
          token,
          retry: false,
          timeout: this.flags.timeout,
          userAgent: `exactcli/${this.config.version}`,
        }),
      )
      return { fullName: me.FullName, email: me.Email }
    } catch {
      return null
    }
  }

  /** @param {Record<string, any>} status */
  #print(status) {
    const line = (label, value) =>
      this.log(`${`${label}:`.padEnd(LABEL_WIDTH)}${value}`)

    line('Profile', status.profile)
    line('Keychain', status.keychain)
    line('Host', status.host)
    if (status.redirectUri) line('Redirect URI', status.redirectUri)
    line('Division', status.division ?? chalk.dim('(not set)'))

    if (!status.authenticated) {
      line('Status', chalk.red('Not authenticated'))
      this.log('')
      this.log(`Run ${chalk.cyan('exactcli auth login')} to authenticate.`)
      return
    }

    line('Token age', `${status.tokenAgeSeconds}s`)
    line('Refreshable now', status.refreshableNow ? 'yes' : 'no')
    line('Refresh token idle', `${status.refreshTokenIdleDays} days`)
    if (status.readOnly) {
      line('Writes', 'locked: read-only credential')
    } else if (status.writeDivisions) {
      const list = status.writeDivisions
      line(
        'Writes',
        list.length === 0
          ? 'locked: no division allowed'
          : `${list.length === 1 ? 'division' : 'divisions'} ${list.join(', ')} only`,
      )
    }
    if (status.refreshTokenIdleDays > IDLE_WARN_DAYS) {
      this.log(
        chalk.yellow(
          'Refresh tokens expire after 30 days without use. ' +
            'Run a command or exactcli auth login soon.',
        ),
      )
    }
    if (status.identity) {
      line('Name', status.identity.fullName)
      line('Email', status.identity.email)
    }
  }
}
