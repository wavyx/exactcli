import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { divisionPath, normalize } from '../../lib/odata.js'
import { collectPages } from '../../lib/pagination.js'

const COLUMNS = {
  Code: { header: 'Code' },
  HID: { header: 'HID' },
  Description: { header: 'Description' },
  Country: { header: 'Country' },
  Currency: { header: 'Currency' },
  Main: { header: 'Main' },
  Status: { header: 'Status' },
}

export default class List extends BaseCommand {
  static description = 'List the divisions (administrations) of the account'

  static examples = [
    '<%= config.bin %> division list',
    '<%= config.bin %> division list --output json',
  ]

  static flags = {
    raw: Flags.boolean({ description: 'Print the raw API envelope' }),
  }

  async run() {
    const division = this.resolveDivision()
    const rows = await collectPages(
      this.apiClient.pageOData(
        divisionPath(division, 'hrm/Divisions'),
        {},
        {
          maxPages: 10,
        },
      ),
      this.flags.limit ?? Infinity,
    )
    await this.outputResults(
      this.flags.raw ? rows : rows.map(normalize),
      COLUMNS,
    )
  }
}
