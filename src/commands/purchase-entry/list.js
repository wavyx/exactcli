import BaseCommand from '../../base-command.js'
import { buildQuery, divisionPath } from '../../lib/odata.js'
import {
  collectListing,
  listingFlags,
  visibleColumns,
} from '../../lib/listing.js'

export const COLUMNS = {
  EntryID: { header: 'EntryID' },
  EntryNumber: { header: 'EntryNumber' },
  EntryDate: { header: 'EntryDate' },
  InvoiceNumber: { header: 'InvoiceNumber' },
  Supplier: { header: 'Supplier' },
  SupplierName: { header: 'SupplierName' },
  Description: { header: 'Description' },
  AmountDC: { header: 'AmountDC' },
  VATAmountDC: { header: 'VATAmountDC' },
  Currency: { header: 'Currency' },
  Journal: { header: 'Journal' },
  StatusDescription: { header: 'StatusDescription' },
}

export default class PurchaseEntryListCommand extends BaseCommand {
  static description =
    'List purchase entries (the accounting ledger of purchases)'

  static examples = [
    '<%= config.bin %> purchase-entry list',
    '<%= config.bin %> purchase-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
    '<%= config.bin %> purchase-entry list --limit 200 --output json',
  ]

  static flags = { ...listingFlags }

  async run() {
    const path = divisionPath(
      this.resolveDivision(),
      'purchaseentry/PurchaseEntries',
    )
    const query = {
      $select: Object.keys(COLUMNS).join(','),
      $orderby: 'EntryDate desc',
      ...buildQuery(this.flags),
    }
    const data = await collectListing(this, path, query)
    await this.outputResults(
      data,
      visibleColumns(COLUMNS, data, this.flags.select),
    )
  }
}
