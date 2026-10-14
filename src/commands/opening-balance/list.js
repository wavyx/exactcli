import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { buildQuery, divisionPath } from '../../lib/odata.js'
import {
  collectListing,
  listingFlags,
  visibleColumns,
} from '../../lib/listing.js'

const COLUMNS = Object.fromEntries(
  [
    'ReportingYear',
    'GLAccountCode',
    'GLAccountDescription',
    'BalanceSide',
    'Amount',
    'GLAccount',
  ].map((c) => [c, { header: c }]),
)

export default class OpeningBalanceListCommand extends BaseCommand {
  static description =
    'List the opening balance of each balance sheet account that is not ' +
    'zero (GET openingbalance/CurrentYear/AfterEntry, GET ' +
    'openingbalance/CurrentYear/Processed, GET ' +
    'openingbalance/PreviousYear/AfterEntry, GET ' +
    'openingbalance/PreviousYear/Processed)'

  static examples = [
    '<%= config.bin %> opening-balance list',
    '<%= config.bin %> opening-balance list --year previous --processed --output csv',
  ]

  static flags = {
    ...listingFlags,
    year: Flags.string({
      options: ['current', 'previous'],
      default: 'current',
      description: 'Reporting year: the current one or the one before',
    }),
    processed: Flags.boolean({
      default: false,
      description:
        'Count the processed entries only (default: every entry, also the ' +
        'ones not processed yet)',
    }),
  }

  async run() {
    const year = this.flags.year === 'current' ? 'CurrentYear' : 'PreviousYear'
    const stage = this.flags.processed ? 'Processed' : 'AfterEntry'
    const path = divisionPath(
      this.resolveDivision(),
      `openingbalance/${year}/${stage}`,
    )
    const query = {
      $select: Object.keys(COLUMNS).join(','),
      ...buildQuery(this.flags),
    }
    const data = await collectListing(this, path, query)
    await this.outputResults(
      data,
      visibleColumns(COLUMNS, data, this.flags.select),
    )
  }
}
