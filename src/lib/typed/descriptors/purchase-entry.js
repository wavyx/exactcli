/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'purchase-entry',
  resource: 'purchaseentry/PurchaseEntries',
  description: 'List purchase entries (the accounting ledger of purchases)',
  examples: [
    '<%= config.bin %> purchase-entry list',
    '<%= config.bin %> purchase-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
    '<%= config.bin %> purchase-entry list --limit 200 --output json',
  ],
  columns: [
    'EntryID',
    'EntryNumber',
    'EntryDate',
    'InvoiceNumber',
    'Supplier',
    'SupplierName',
    'Description',
    'AmountDC',
    'VATAmountDC',
    'Currency',
    'Journal',
    'StatusDescription',
  ],
  orderBy: 'EntryDate desc',
  filters: {},
}

export default descriptor
