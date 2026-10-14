import BaseCommand from '../../base-command.js'
import { getAliases } from '../../lib/aliases.js'

const COLUMNS = {
  name: { header: 'Alias' },
  command: { header: 'Command', get: (row) => row.command.join(' ') },
}

export default class AliasListCommand extends BaseCommand {
  static skipAuth = true

  static description = 'List the aliases'

  static examples = ['<%= config.bin %> alias list']

  async run() {
    const rows = Object.entries(getAliases()).map(([name, command]) => ({
      name,
      command,
    }))
    await this.outputResults(rows, COLUMNS)
  }
}
