import { accessSync, constants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { Flags } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../base-command.js'
import { getConf, getProfileConfig } from '../lib/config.js'
import { getOAuthTokens, isKeychainAvailable } from '../lib/keychain.js'
import { HOST_RE, createClient } from '../lib/client.js'
import { REFRESH_FLOOR_MS, fetchMe } from '../lib/auth.js'

const MIN_NODE_MAJOR = 20
const DEFAULT_HOST = 'start.exactonline.be'

const COLUMNS = {
  check: { header: 'Check' },
  status: { header: 'Status' },
  detail: { header: 'Detail' },
}

/** @param {string} bin */
function onPath(bin, pathEnv = process.env.PATH ?? '') {
  return pathEnv.split(delimiter).some((dir) => {
    if (!dir) return false
    try {
      accessSync(join(dir, bin), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

function bundledJqPath() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('node-jq/package.json')), 'bin', 'jq')
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

    const major = Number(process.versions.node.split('.')[0])
    add('node', major >= MIN_NODE_MAJOR, process.version)

    let confPath = ''
    try {
      confPath = getConf().path
      add('config', true, confPath)
    } catch (err) {
      add('config', false, err.message)
    }

    add('keychain', isKeychainAvailable(), 'OS keychain')
    add('profile', true, profile)

    const host = getProfileConfig(profile, 'host') ?? DEFAULT_HOST
    add('host', HOST_RE.test(host), host)

    const domain = getProfileConfig(profile, 'ngrok_domain')
    add('ngrok-domain', Boolean(domain), domain ?? 'not set (auth login asks)')
    add('ngrok', onPath('ngrok'), 'ngrok on PATH (or use auth login --manual)')

    const jqPath = process.env.JQ_PATH ?? bundledJqPath()
    add('jq', existsSync(jqPath), jqPath)

    const division = getProfileConfig(profile, 'division')
    add('division', Boolean(division), division ? String(division) : 'not set')

    const blob = await getOAuthTokens(profile)
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

    if (offline) {
      add('api', true, 'skipped (--offline)')
    } else if (!blob) {
      add('api', false, 'skipped: no token')
    } else {
      try {
        const me = await fetchMe(
          createClient({
            host,
            token: blob.accessToken,
            retry: false,
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
        const mark = r.status === 'ok' ? chalk.green('[ok]') : chalk.red('[!!]')
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
