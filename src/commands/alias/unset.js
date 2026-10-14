import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getAlias, unsetAlias } from '../../lib/aliases.js'
import { CliError } from '../../lib/errors.js'

export default class AliasUnsetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Remove an alias'

  static examples = ['<%= config.bin %> alias unset unpaid']

  static args = {
    name: Args.string({ required: true, description: 'Alias name' }),
  }

  async run() {
    const { args } = await this.parse(AliasUnsetCommand)
    if (!getAlias(args.name)) {
      throw new CliError(`No alias ${args.name}`, { exitCode: 64 })
    }
    await unsetAlias(args.name)
    await this.outputAction(
      { removed: args.name },
      `Alias removed: ${args.name}`,
    )
  }
}
