import BaseCommand from '../../base-command.js'
import { getAllProfiles, getActiveProfile } from '../../lib/config.js'
import { getOAuthTokens } from '../../lib/keychain.js'

const COLUMNS = {
  name: { header: 'Name' },
  active: { header: 'Active', get: (row) => (row.active ? 'yes' : 'no') },
  authenticated: {
    header: 'Authenticated',
    get: (row) => (row.authenticated ? 'yes' : 'no'),
  },
  host: { header: 'Host' },
  division: { header: 'Division' },
}

export default class ProfileListCommand extends BaseCommand {
  static skipAuth = true

  static description = 'List all configured profiles'

  static examples = ['<%= config.bin %> profile list']

  async run() {
    const profiles = getAllProfiles()
    const active = getActiveProfile()
    const names = new Set(Object.keys(profiles))

    // The active profile can hold OAuth tokens before it ever gets a config
    // entry (a first login writes to the keychain, not to the conf store).
    if ((await getOAuthTokens(active)) != null) names.add(active)

    if (names.size === 0 && this.resolveFormat() === 'table') {
      this.log('No profiles configured. Run: exactcli auth login')
      return
    }

    const rows = []
    for (const name of names) {
      const data = profiles[name] ?? {}
      rows.push({
        name,
        active: name === active,
        authenticated: (await getOAuthTokens(name)) != null,
        host: data.host,
        division: data.division,
      })
    }

    await this.outputResults(rows, COLUMNS)
  }
}
