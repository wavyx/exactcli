import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { normalize, unwrap } from '../lib/odata.js'

const ME_PATH = '/api/v1/current/Me'

const COLUMNS = {
  CurrentDivision: { header: 'CurrentDivision' },
  FullName: { header: 'FullName' },
  Email: { header: 'Email' },
  UserName: { header: 'UserName' },
  Legislation: { header: 'Legislation' },
  ServerTime: { header: 'ServerTime' },
  ServerUtcOffset: { header: 'ServerUtcOffset' },
}

export default class Me extends BaseCommand {
  static description = 'Show the current user and session (GET current/Me)'

  static examples = [
    '<%= config.bin %> me',
    '<%= config.bin %> me --raw',
    '<%= config.bin %> me --output json',
  ]

  static flags = {
    raw: Flags.boolean({ description: 'Print the raw API envelope' }),
  }

  async run() {
    // current/Me needs no division: it is quota free and answers the same
    // user record for every division the account can reach.
    const body = await this.apiClient.get(ME_PATH)

    if (this.flags.raw) {
      await this.outputResults(body, {})
      return
    }

    const data = unwrap(body)
    const record = Array.isArray(data) ? data[0] : data
    await this.outputResults(normalize(record), COLUMNS)
  }
}
