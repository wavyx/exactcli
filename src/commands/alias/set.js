import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import {
  aliasArgv,
  checkAlias,
  getAliases,
  setAlias,
} from '../../lib/aliases.js'

export default class AliasSetCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Create or replace an alias: a short name that runs a longer command'

  static examples = [
    '<%= config.bin %> alias set unpaid "receivable list --all"',
    `<%= config.bin %> alias set acme -- account list --filter "Name eq 'Acme NV'"`,
  ]

  /** The command words follow the name: as one quoted string or after --. */
  static strict = false

  static args = {
    name: Args.string({ required: true, description: 'Alias name' }),
    command: Args.string({
      required: true,
      description: 'Command to run, as one quoted string or after --',
    }),
  }

  async run() {
    const { argv } = await this.parse(AliasSetCommand)
    const [name, ...words] = argv
    const command = aliasArgv(words)
    const { writes } = checkAlias(name, command, this.config, getAliases())
    // An alias runs with the flags it carries: name the ones that write.
    if (writes) {
      process.stderr.write(
        `Warning: alias ${name} can write to Exact Online. The command keeps ` +
          `its own gates (--allow-writes, --yes, read-only profiles).\n`,
      )
    }
    await setAlias(name, command)
    await this.outputAction(
      { name, command },
      `Alias set: ${name} = ${command.join(' ')}`,
    )
  }
}
