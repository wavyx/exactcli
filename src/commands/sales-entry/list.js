import BaseCommand from '../../base-command.js'
import { buildQuery, divisionPath } from '../../lib/odata.js'
import { collectListing, listingFlags } from '../../lib/listing.js'

export const COLUMNS = {
  EntryID: { header: 'EntryID' },
  EntryNumber: { header: 'EntryNumber' },
  EntryDate: { header: 'EntryDate' },
  InvoiceNumber: { header: 'InvoiceNumber' },
  Customer: { header: 'Customer' },
  CustomerName: { header: 'CustomerName' },
  Description: { header: 'Description' },
  AmountDC: { header: 'AmountDC' },
  VATAmountDC: { header: 'VATAmountDC' },
  Currency: { header: 'Currency' },
  Journal: { header: 'Journal' },
  StatusDescription: { header: 'StatusDescription' },
}

export default class SalesEntryListCommand extends BaseCommand {
  static description = 'List sales entries (the accounting ledger of sales)'

  static examples = [
    '<%= config.bin %> sales-entry list',
    '<%= config.bin %> sales-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
    '<%= config.bin %> sales-entry list --limit 200 --output json',
  ]

  static flags = { ...listingFlags }

  async run() {
    const path = divisionPath(this.resolveDivision(), 'salesentry/SalesEntries')
    const query = {
      $select: Object.keys(COLUMNS).join(','),
      $orderby: 'EntryDate desc',
      ...buildQuery(this.flags),
    }
    const data = await collectListing(this, path, query)
    await this.outputResults(data, COLUMNS)
  }
}
