/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'sales-invoice',
  resource: 'salesinvoice/SalesInvoices',
  description: 'List sales invoices (the invoices sent to customers)',
  examples: [
    '<%= config.bin %> sales-invoice list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> sales-invoice list --customer 1001 --status 20 --all',
  ],
  columns: [
    'InvoiceNumber',
    'InvoiceDate',
    'OrderedByName',
    'Description',
    'AmountDC',
    'VATAmountDC',
    'StatusDescription',
    'DueDate',
    'InvoiceID',
  ],
  orderBy: 'InvoiceDate desc',
  filters: {
    customer: {
      field: 'OrderedBy',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Customer GUID or code (the account that ordered)',
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
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
