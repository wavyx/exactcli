import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { setActiveProfile } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'

// The profile name becomes part of a lock file path, so it must stay a safe
// filesystem segment.
const NAME_RE = /^[A-Za-z0-9._-]+$/

export default class ProfileUseCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Switch the active profile'

  static examples = ['<%= config.bin %> profile use work']

  static args = {
    name: Args.string({
      required: true,
      description: 'Profile name to activate',
    }),
  }

  async run() {
    const { args } = await this.parse(ProfileUseCommand)

    if (!NAME_RE.test(args.name)) {
      throw new CliError(
        'Profile names may contain letters, digits, dot, underscore and dash',
        { exitCode: 64 },
      )
    }

    setActiveProfile(args.name)
    await this.outputAction(
      { profile: args.name, active: true },
      `Switched to profile ${chalk.cyan(args.name)}`,
    )
  }
}
