import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { normalizeDomain, setProfileConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { HOST_RE } from '../../lib/client.js'
import { getOAuthTokens, setOAuthTokens } from '../../lib/keychain.js'
import { withLock } from '../../lib/lock.js'

const ALLOWED_KEYS = [
  'host',
  'ngrok_domain',
  'division',
  'default_output',
  'read_only',
]
const OUTPUT_FORMATS = ['table', 'json', 'yaml', 'csv']

/**
 * Validate and coerce a raw CLI value for a known config key. Throws a
 * CliError (exit 64) on an invalid value.
 * @param {string} key
 * @param {string} rawValue
 * @returns {string | number}
 */
function normalizeValue(key, rawValue) {
  if (key === 'default_output') {
    if (!OUTPUT_FORMATS.includes(rawValue)) {
      throw new CliError(
        `Invalid default_output "${rawValue}". Allowed: ${OUTPUT_FORMATS.join(', ')}`,
        { exitCode: 64 },
      )
    }
    return rawValue
  }

  if (key === 'read_only') {
    if (rawValue !== 'true' && rawValue !== 'false') {
      throw new CliError('read_only must be true or false', { exitCode: 64 })
    }
    return rawValue === 'true'
  }

  if (key === 'division') {
    if (!/^\d+$/.test(rawValue) || Number(rawValue) <= 0) {
      throw new CliError('division must be a positive integer', {
        exitCode: 64,
      })
    }
    return Number(rawValue)
  }

  if (key === 'host') {
    if (!HOST_RE.test(rawValue)) {
      throw new CliError(
        'host must be an Exact Online host, for example start.exactonline.be',
        { exitCode: 64 },
      )
    }
    return rawValue
  }

  // ngrok_domain: no fixed format, only cleaned of a scheme and a trailing slash.
  return normalizeDomain(rawValue)
}

export default class ConfigSetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Set a config value for the active profile'

  static examples = [
    '<%= config.bin %> config set host start.exactonline.be',
    '<%= config.bin %> config set division 123456',
    '<%= config.bin %> config set read_only true',
  ]

  static args = {
    key: Args.string({ required: true, description: 'Config key to set' }),
    value: Args.string({ required: true, description: 'Value to assign' }),
  }

  async run() {
    const { args } = await this.parse(ConfigSetCommand)

    if (!ALLOWED_KEYS.includes(args.key)) {
      throw new CliError(
        `Unknown config key ${args.key}. Allowed: ${ALLOWED_KEYS.join(', ')}`,
        { exitCode: 64 },
      )
    }

    const value = normalizeValue(args.key, args.value)

    setProfileConfig(this.activeProfile, args.key, value)
    if (args.key === 'read_only') await this.#lockCredential(value)
    await this.outputAction(
      { profile: this.activeProfile, key: args.key, value },
      `Set ${chalk.cyan(args.key)} = ${chalk.green(value)} for profile ${chalk.cyan(this.activeProfile)}`,
    )
  }

  /**
   * The lock lives in the keychain blob too: the config store follows
   * EXACTCLI_CONFIG_DIR, the credential does not, so a config-only lock falls
   * away with an empty config directory. The write takes the oauth lock: a
   * refresh in a sibling process rotates the same blob, and a stale copy
   * written over it would spend the refresh token twice.
   * @param {boolean} readOnly
   */
  async #lockCredential(readOnly) {
    const profile = this.activeProfile
    await withLock(`oauth-${profile}`, async () => {
      const blob = await getOAuthTokens(profile)
      if (blob) await setOAuthTokens(profile, { ...blob, readOnly })
    })
  }
}
