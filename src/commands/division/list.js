import { Flags } from '@oclif/core'
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

/** The system resources carry no HID and no Main, but the customer. */
const SYSTEM_COLUMNS = {
  Code: { header: 'Code' },
  Description: { header: 'Description' },
  CustomerName: { header: 'CustomerName' },
  Country: { header: 'Country' },
  Currency: { header: 'Currency' },
  Status: { header: 'Status' },
}

/** Which divisions a scope lists, and the resource that knows them. */
const SCOPES = {
  // The accessible divisions of the license that owns the active division.
  license: 'hrm/Divisions',
  // The accessible divisions of every license (an accountant sees clients).
  accessible: 'system/Divisions',
  // Every division of the license, also those without access rights.
  all: 'system/AllDivisions',
  // The five divisions used last.
  recent: 'system/GetMostRecentlyUsedDivisions',
}

export default class List extends BaseCommand {
  static description =
    'List the divisions (administrations) of the account (GET hrm/Divisions; ' +
    '--scope accessible: GET system/Divisions, all: GET system/AllDivisions, ' +
    'recent: GET system/GetMostRecentlyUsedDivisions)'

  static examples = [
    '<%= config.bin %> division list',
    '<%= config.bin %> division list --all',
    '<%= config.bin %> division list --output json',
    '<%= config.bin %> division list --scope accessible',
  ]

  static flags = {
    ...listingFlags,
    scope: Flags.string({
      options: Object.keys(SCOPES),
      default: 'license',
      description:
        'license: accessible divisions of this license; accessible: of ' +
        'every license; all: every division of this license; recent: the ' +
        'last five used',
    }),
  }

  async run() {
    const active = this.resolveDivision()
    const resource = SCOPES[this.flags.scope]
    const path = divisionPath(active, resource)
    const data = await collectListing(this, path)
    // The mark is a table column only: the rows stay as Exact sent them.
    const columns = {
      ...(resource === SCOPES.license ? COLUMNS : SYSTEM_COLUMNS),
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
