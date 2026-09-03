import BaseCommand from '../../base-command.js'
import { getProfileConfig } from '../../lib/config.js'
import { requireDivision } from '../../lib/odata.js'

export default class DivisionCurrentCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Show the division (administration) in use'

  static examples = [
    '<%= config.bin %> division current',
    '<%= config.bin %> division current --output json',
  ]

  async run() {
    // --division (and EXACTCLI_DIVISION) wins over the profile, as everywhere.
    const division = requireDivision(
      this.flags.division ?? getProfileConfig(this.activeProfile, 'division'),
    )
    await this.outputAction(
      { profile: this.activeProfile, division },
      `Profile ${this.activeProfile} uses division ${division}`,
    )
  }
}
