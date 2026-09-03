import BaseCommand from '../../base-command.js'
import { divisionPath } from '../../lib/odata.js'
import {
  collectListing,
  listingFlags,
  visibleColumns,
} from '../../lib/listing.js'

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
    '<%= config.bin %> division list --all',
    '<%= config.bin %> division list --output json',
  ]

  static flags = { ...listingFlags }

  async run() {
    const active = this.resolveDivision()
    const path = divisionPath(active, 'hrm/Divisions')
    const data = await collectListing(this, path)
    // The mark is a table column only: the rows stay as Exact sent them.
    const columns = {
      ...COLUMNS,
      Active: {
        header: 'Active',
        get: (row) => (Number(row.Code) === active ? 'yes' : ''),
      },
    }
    await this.outputResults(
      data,
      visibleColumns(columns, data, this.flags.select),
    )
  }
}
