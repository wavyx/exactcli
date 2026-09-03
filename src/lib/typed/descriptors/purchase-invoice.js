/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'purchase-invoice',
  resource: 'purchase/PurchaseInvoices',
  description: 'List purchase invoices (the invoices received from suppliers)',
  examples: [
    '<%= config.bin %> purchase-invoice list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> purchase-invoice list --supplier 2001 --status 20 --output json',
  ],
  columns: [
    'EntryNumber',
    'InvoiceDate',
    'Supplier',
    'YourRef',
    'Description',
    'Amount',
    'VATAmount',
    'Status',
    'DueDate',
    'ID',
  ],
  orderBy: 'InvoiceDate desc',
  filters: {
    supplier: {
      field: 'Supplier',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Supplier GUID or code',
    },
    from: {
      field: 'InvoiceDate',
      op: 'ge',
      type: 'date',
      description: 'Invoice date from (YYYY-MM-DD)',
    },
    to: {
      field: 'InvoiceDate',
      op: 'le',
      type: 'date',
      description: 'Invoice date to (YYYY-MM-DD)',
    },
    status: {
      field: 'Status',
      type: 'int',
      description: 'Status code: 10 draft, 20 open, 50 processed',
    },
  },
}

export default descriptor
