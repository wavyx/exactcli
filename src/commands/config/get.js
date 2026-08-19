import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { getProfileConfig } from '../../lib/config.js'

export default class ConfigGetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Get a config value for the active profile'

  static examples = [
    '<%= config.bin %> config get host',
    '<%= config.bin %> config get division',
  ]

  static args = {
    key: Args.string({ required: true, description: 'Config key to read' }),
  }

  async run() {
    const { args } = await this.parse(ConfigGetCommand)

    const value = getProfileConfig(this.activeProfile, args.key)

    if (this.resolveFormat() === 'table') {
      this.log(value === undefined ? '' : String(value))
      return
    }

    await this.outputResults({ key: args.key, value }, {})
  }
}
