import { Args } from '@oclif/core'
import chalk from 'chalk'
import BaseCommand from '../../base-command.js'
import { getProfileConfig, deleteProfileConfig } from '../../lib/config.js'
import { getOAuthTokens, setOAuthTokens } from '../../lib/keychain.js'
import { withLock } from '../../lib/lock.js'

export default class ConfigUnsetCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Remove a config key from the active profile'

  static examples = ['<%= config.bin %> config unset default_output']

  static args = {
    key: Args.string({ required: true, description: 'Config key to remove' }),
  }

  async run() {
    const { args } = await this.parse(ConfigUnsetCommand)

    const inConfig =
      getProfileConfig(this.activeProfile, args.key) !== undefined
    const inCredential =
      args.key === 'write_divisions' && (await this.#clearCredentialList())
    if (!inConfig && !inCredential) {
      await this.outputAction(
        { profile: this.activeProfile, key: args.key, unset: false },
        `${chalk.cyan(args.key)} is not set for profile ${chalk.cyan(this.activeProfile)}`,
      )
      return
    }

    if (inConfig) deleteProfileConfig(this.activeProfile, args.key)
    await this.outputAction(
      { profile: this.activeProfile, key: args.key, unset: true },
      `Removed ${chalk.cyan(args.key)} from profile ${chalk.cyan(this.activeProfile)}`,
    )
  }

  /**
   * The write division list lives in the keychain blob too, so an unset
   * clears it there, under the oauth lock that a refresh also takes.
   * @returns {Promise<boolean>} true when the blob carried a list
   */
  async #clearCredentialList() {
    const profile = this.activeProfile
    return withLock(`oauth-${profile}`, async () => {
      const blob = await getOAuthTokens(profile)
      if (!Array.isArray(blob?.writeDivisions)) return false
      const rest = { ...blob }
      delete rest.writeDivisions
      await setOAuthTokens(profile, rest)
      return true
    })
  }
}
