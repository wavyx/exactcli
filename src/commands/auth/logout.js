import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { deleteOAuthTokens } from '../../lib/keychain.js'

export default class LogoutCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Remove the stored credentials of the profile'

  static examples = [
    '<%= config.bin %> auth logout',
    '<%= config.bin %> auth logout --profile acme',
  ]

  async run() {
    await this.parse(LogoutCommand)

    await deleteOAuthTokens(this.activeProfile)
    this.log(chalk.green(`Logged out of profile ${this.activeProfile}`))
  }
}
