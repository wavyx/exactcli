/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'sales-entry',
  resource: 'salesentry/SalesEntries',
  description: 'List sales entries (the accounting ledger of sales)',
  examples: [
    '<%= config.bin %> sales-entry list',
    '<%= config.bin %> sales-entry list --filter "EntryDate ge datetime\'2026-01-01\'" --all',
    '<%= config.bin %> sales-entry list --limit 200 --output json',
  ],
  columns: [
    'EntryID',
    'EntryNumber',
    'EntryDate',
    'InvoiceNumber',
    'Customer',
    'CustomerName',
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
