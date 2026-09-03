import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../base-command.js'
import { getConf, getProfileConfig } from '../lib/config.js'
import { getOAuthTokens, isKeychainAvailable } from '../lib/keychain.js'
import { DEFAULT_HOST, HOST_RE, createClient } from '../lib/client.js'
import { jqBinaryExists, jqBinaryPath } from '../lib/jq.js'
import { REFRESH_FLOOR_MS, fetchMe } from '../lib/auth.js'

const MIN_NODE_MAJOR = 20

const COLUMNS = {
  check: { header: 'Check' },
  status: { header: 'Status' },
  detail: { header: 'Detail' },
}

/** @param {string} bin @returns {boolean} true when PATH holds that executable */
function onPath(bin) {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => {
    if (!dir) return false
    try {
      accessSync(join(dir, bin), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

export default class DoctorCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Check the local setup: runtime, keychain, profile, ngrok, jq, token and API reachability. ' +
    'Exits 1 when a check fails.'

  static examples = [
    '<%= config.bin %> doctor',
    '<%= config.bin %> doctor --offline',
    '<%= config.bin %> doctor --output json',
  ]

  static flags = {
    offline: Flags.boolean({
      description: 'Skip the API reachability probe',
      default: false,
    }),
  }

  async run() {
    const { offline } = this.flags
    const profile = this.activeProfile
    const results = []
    const add = (check, ok, detail = '') =>
      results.push({ check, status: ok ? 'ok' : 'FAIL', detail })
    // A warning names an optional part of the setup. It never fails the run.
    const warn = (check, detail) =>
      results.push({ check, status: 'warn', detail })

    const major = Number(process.versions.node.split('.')[0])
    add('node', major >= MIN_NODE_MAJOR, process.version)

    try {
      add('config', true, getConf().path)
    } catch (err) {
      add('config', false, err.message)
    }

    add('keychain', isKeychainAvailable(), 'OS keychain')
    add('profile', true, profile)

    const host = getProfileConfig(profile, 'host') ?? DEFAULT_HOST
    add('host', HOST_RE.test(host), host)

    const domain = getProfileConfig(profile, 'ngrok_domain')
    if (domain) add('ngrok-domain', true, String(domain))
    else warn('ngrok-domain', 'not set (auth login asks; --manual needs none)')

    // ngrok and jq are optional: only auth login without --manual needs the
    // one, only --jq needs the other. A missing binary is a warning.
    const ngrokBins =
      process.platform === 'win32' ? ['ngrok.exe', 'ngrok'] : ['ngrok']
    if (ngrokBins.some((bin) => onPath(bin)))
      add('ngrok', true, 'ngrok on PATH')
    else warn('ngrok', 'ngrok not on PATH (auth login --manual needs none)')

    if (jqBinaryExists()) add('jq', true, jqBinaryPath())
    else warn('jq', 'jq binary not found (only --jq needs it)')

    // --division also reads EXACTCLI_DIVISION, and it wins over the profile.
    const division =
      this.flags.division ?? getProfileConfig(profile, 'division')
    add('division', Boolean(division), division ? String(division) : 'not set')

    // Writes are off by default. A global switch in the environment deserves
    // a reminder: every command in this shell may write.
    if (process.env.EXACTCLI_ALLOW_WRITES === '1') {
      warn('writes', 'EXACTCLI_ALLOW_WRITES is set: every command may write')
    } else {
      add('writes', true, 'off (default)')
    }

    const envToken = process.env.EXACTCLI_ACCESS_TOKEN
    let blob = null
    if (envToken) {
      add('token', true, 'from EXACTCLI_ACCESS_TOKEN')
    } else {
      blob = await getOAuthTokens(profile)
      if (!blob) {
        add('token', false, 'not logged in. Run: exactcli auth login')
      } else {
        const age = Date.now() - blob.obtainedAt
        const ageS = Math.round(age / 1000)
        add(
          'token',
          true,
          `age ${ageS}s, ${age >= REFRESH_FLOOR_MS ? 'refreshable' : 'fresh'}`,
        )
      }
    }

    const token = envToken ?? blob?.accessToken
    if (offline) {
      add('api', true, 'skipped (--offline)')
    } else if (!token) {
      // The token check already reports the missing login. Do not count it twice.
      add('api', true, 'skipped: no token')
    } else {
      try {
        const me = await fetchMe(
          createClient({
            host,
            token,
            retry: false,
            timeout: this.flags.timeout,
            userAgent: `exactcli/${this.config.version}`,
          }),
        )
        add('api', Boolean(me), me ? `current/Me ok (${me.FullName})` : 'empty')
      } catch (err) {
        add('api', false, err.message)
      }
    }

    const failed = results.filter((r) => r.status === 'FAIL')
    if (failed.length > 0) process.exitCode = 1

    if (this.resolveFormat() === 'table') {
      for (const r of results) {
        const mark =
          r.status === 'ok'
            ? chalk.green('[ok]')
            : r.status === 'warn'
              ? chalk.yellow('[--]')
              : chalk.red('[!!]')
        this.log(`${mark} ${r.check.padEnd(13)} ${r.detail}`)
      }
      this.log('')
      this.log(
        failed.length === 0
          ? chalk.green('All checks passed.')
          : chalk.red(`${failed.length} check(s) failed.`),
      )
      return
    }
    await this.outputResults(results, COLUMNS)
  }
}
