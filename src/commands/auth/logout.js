import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { deleteOAuthTokens } from '../../lib/keychain.js'
import { withLock } from '../../lib/lock.js'

export default class LogoutCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Remove the stored credentials of the profile'

  static examples = [
    '<%= config.bin %> auth logout',
    '<%= config.bin %> auth logout --profile acme',
  ]

  async run() {
    await this.parse(LogoutCommand)
    const profile = this.activeProfile

    // A refresh in a sibling process would write fresh credentials back
    // after the delete, so the delete waits for the oauth lock.
    await withLock(`oauth-${profile}`, () => deleteOAuthTokens(profile))
    this.log(chalk.green(`Logged out of profile ${profile}`))
  }
}
