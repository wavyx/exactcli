import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { setProfileConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { HOST_RE } from '../../lib/client.js'

const ALLOWED_KEYS = ['host', 'ngrok_domain', 'division', 'default_output']
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
  return rawValue
    .trim()
    .replace(/^https:\/\//, '')
    .replace(/\/$/, '')
}

export default class ConfigSetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Set a config value for the active profile'

  static examples = [
    '<%= config.bin %> config set host start.exactonline.be',
    '<%= config.bin %> config set division 123456',
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
    await this.outputAction(
      { profile: this.activeProfile, key: args.key, value },
      `Set ${chalk.cyan(args.key)} = ${chalk.green(value)} for profile ${chalk.cyan(this.activeProfile)}`,
    )
  }
}
